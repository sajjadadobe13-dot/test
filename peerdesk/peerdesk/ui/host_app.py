"""Host window: share this computer and approve/deny incoming sessions.

The defining piece here is the *consent dialog*.  When a viewer requests a
session, PeerDesk blocks and pops this dialog on the operator's screen showing
exactly who is connecting and which rights they asked for.  Nothing streams and
no input is accepted until the operator clicks Accept, and the choice applies to
that one session only.
"""

from __future__ import annotations

import queue
import threading
import tkinter as tk
from tkinter import messagebox, ttk
from typing import Dict, Optional

from ..config import Config
from ..host import HostContext, ScreenHost
from ..link import Link
from ..protocol import PERMISSION_UPDATE
from ..sessions import Permission, Session

CONSENT_TIMEOUT = 120  # seconds the operator has to decide

_PERM_LABELS = {
    Permission.VIEW: "View the screen",
    Permission.CONTROL: "Control keyboard & mouse",
    Permission.FILE_TRANSFER: "Transfer files",
    Permission.CLIPBOARD: "Share clipboard",
}


class HostApp:
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config.load()
        self.root = tk.Tk()
        self.root.title("PeerDesk - This Computer")
        self.root.geometry("460x560")
        self.root.minsize(420, 500)

        self._host: Optional[ScreenHost] = None
        self._active: Dict[str, "ActiveSession"] = {}
        self._ui_queue: "queue.Queue" = queue.Queue()

        self._build()
        self.root.after(100, self._drain_ui_queue)

    # -- layout -------------------------------------------------------------
    def _build(self) -> None:
        pad = {"padx": 12, "pady": 6}

        header = ttk.Frame(self.root)
        header.pack(fill="x", **pad)
        ttk.Label(header, text="Your Address", font=("Segoe UI", 10)).pack(anchor="w")
        ttk.Label(header, text=self.config.device_id,
                  font=("Consolas", 26, "bold")).pack(anchor="w")
        ttk.Label(header, text=self.config.device_name,
                  foreground="#666").pack(anchor="w")

        self.status_var = tk.StringVar(value="Stopped")
        status = ttk.Frame(self.root)
        status.pack(fill="x", **pad)
        ttk.Label(status, text="Status:").pack(side="left")
        self.status_label = ttk.Label(status, textvariable=self.status_var,
                                       foreground="#b00")
        self.status_label.pack(side="left", padx=6)
        self.toggle_btn = ttk.Button(status, text="Start Sharing",
                                     command=self._toggle)
        self.toggle_btn.pack(side="right")

        # Security settings
        sec = ttk.LabelFrame(self.root, text="Security")
        sec.pack(fill="x", **pad)
        self.var_consent = tk.BooleanVar(value=self.config.require_consent)
        self.var_control = tk.BooleanVar(value=self.config.allow_control)
        self.var_files = tk.BooleanVar(value=self.config.allow_file_transfer)
        self.var_clip = tk.BooleanVar(value=self.config.allow_clipboard)
        ttk.Checkbutton(sec, text="Ask me before every session (recommended)",
                        variable=self.var_consent).pack(anchor="w", padx=8, pady=2)
        ttk.Checkbutton(sec, text="Allow remote control",
                        variable=self.var_control).pack(anchor="w", padx=8, pady=2)
        ttk.Checkbutton(sec, text="Allow file transfer",
                        variable=self.var_files).pack(anchor="w", padx=8, pady=2)
        ttk.Checkbutton(sec, text="Allow clipboard sharing",
                        variable=self.var_clip).pack(anchor="w", padx=8, pady=2)

        pw = ttk.Frame(sec)
        pw.pack(fill="x", padx=8, pady=4)
        ttk.Label(pw, text="Unattended password (optional):").pack(anchor="w")
        self.var_password = tk.StringVar(value=self.config.unattended_password)
        ttk.Entry(pw, textvariable=self.var_password, show="*").pack(fill="x")

        # Active sessions
        act = ttk.LabelFrame(self.root, text="Active Sessions")
        act.pack(fill="both", expand=True, **pad)
        self.active_frame = ttk.Frame(act)
        self.active_frame.pack(fill="both", expand=True, padx=6, pady=6)

        # Log
        logf = ttk.LabelFrame(self.root, text="Activity")
        logf.pack(fill="both", expand=True, **pad)
        self.log_text = tk.Text(logf, height=6, state="disabled",
                                font=("Consolas", 8))
        self.log_text.pack(fill="both", expand=True, padx=4, pady=4)

    # -- host lifecycle -----------------------------------------------------
    def _apply_settings(self) -> None:
        self.config.require_consent = self.var_consent.get()
        self.config.allow_control = self.var_control.get()
        self.config.allow_file_transfer = self.var_files.get()
        self.config.allow_clipboard = self.var_clip.get()
        self.config.unattended_password = self.var_password.get().strip()
        self.config.save()

    def _toggle(self) -> None:
        if self._host is None:
            self._start()
        else:
            self._stop()

    def _start(self) -> None:
        self._apply_settings()
        ctx = HostContext(
            device_id=self.config.device_id,
            device_name=self.config.device_name,
            policy=self.config.host_policy(),
            consent_provider=self._consent_provider,
            download_dir=self.config.download_dir,
            encrypt=self.config.encrypt_sessions,
            log=self._log_threadsafe,
            on_active=self._on_active,
            on_closed=self._on_closed,
        )
        self._host = ScreenHost(ctx, host="0.0.0.0", port=self.config.listen_port)
        self._host.start()
        self.status_var.set("Listening")
        self.status_label.configure(foreground="#070")
        self.toggle_btn.configure(text="Stop Sharing")

    def _stop(self) -> None:
        if self._host:
            self._host.stop()
            self._host = None
        self.status_var.set("Stopped")
        self.status_label.configure(foreground="#b00")
        self.toggle_btn.configure(text="Start Sharing")

    # -- consent (called from a connection thread) --------------------------
    def _consent_provider(self, session: Session):
        if self.config.auto_accept and not self.config.require_consent:
            return set(session.requested)
        decision: Dict[str, Optional[set]] = {"granted": None}
        event = threading.Event()
        self._ui_queue.put(
            lambda: self._show_consent_dialog(session, decision, event))
        if not event.wait(timeout=CONSENT_TIMEOUT):
            return None  # timed out -> declined
        return decision["granted"]

    def _show_consent_dialog(self, session: Session, decision, event) -> None:
        dlg = tk.Toplevel(self.root)
        dlg.title("Connection Request")
        dlg.attributes("-topmost", True)
        dlg.grab_set()
        ttk.Label(dlg, text="Someone wants to connect to your computer",
                  font=("Segoe UI", 11, "bold")).pack(padx=16, pady=(16, 4))
        ttk.Label(dlg, text=session.peer.label(),
                  foreground="#333").pack(padx=16)

        box = ttk.LabelFrame(dlg, text="They are requesting permission to:")
        box.pack(fill="x", padx=16, pady=10)
        vars_by_perm = {}
        for perm in (Permission.VIEW, Permission.CONTROL,
                     Permission.FILE_TRANSFER, Permission.CLIPBOARD):
            if perm not in session.requested and perm is not Permission.VIEW:
                continue
            v = tk.BooleanVar(value=True)
            vars_by_perm[perm] = v
            state = "disabled" if perm is Permission.VIEW else "normal"
            ttk.Checkbutton(box, text=_PERM_LABELS[perm], variable=v,
                            state=state).pack(anchor="w", padx=8, pady=2)

        btns = ttk.Frame(dlg)
        btns.pack(fill="x", padx=16, pady=(4, 16))

        def accept():
            granted = {p for p, v in vars_by_perm.items() if v.get()}
            granted.add(Permission.VIEW)
            decision["granted"] = granted
            event.set()
            dlg.destroy()

        def reject():
            decision["granted"] = None
            event.set()
            dlg.destroy()

        dlg.protocol("WM_DELETE_WINDOW", reject)
        ttk.Button(btns, text="Reject", command=reject).pack(side="right")
        ttk.Button(btns, text="Accept", command=accept).pack(side="right", padx=6)

    # -- active sessions ----------------------------------------------------
    def _on_active(self, session: Session, link: Link) -> None:
        self._ui_queue.put(lambda: self._add_active_row(session, link))

    def _on_closed(self, session: Session) -> None:
        self._ui_queue.put(lambda: self._remove_active_row(session.id))

    def _add_active_row(self, session: Session, link: Link) -> None:
        row = ActiveSession(self.active_frame, session, link, self._log_threadsafe)
        self._active[session.id] = row

    def _remove_active_row(self, session_id: str) -> None:
        row = self._active.pop(session_id, None)
        if row:
            row.destroy()

    # -- logging / ui pump --------------------------------------------------
    def _log_threadsafe(self, message: str) -> None:
        self._ui_queue.put(lambda: self._append_log(message))

    def _append_log(self, message: str) -> None:
        self.log_text.configure(state="normal")
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _drain_ui_queue(self) -> None:
        try:
            while True:
                fn = self._ui_queue.get_nowait()
                try:
                    fn()
                except Exception:
                    pass
        except queue.Empty:
            pass
        self.root.after(100, self._drain_ui_queue)

    def run(self) -> None:
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.mainloop()

    def _on_close(self) -> None:
        self._stop()
        self.root.destroy()


class ActiveSession:
    """A row in the Active Sessions panel with live revoke controls."""

    def __init__(self, parent, session: Session, link: Link, log):
        self.session = session
        self.link = link
        self.log = log
        self.frame = ttk.Frame(parent, relief="groove", borderwidth=1)
        self.frame.pack(fill="x", pady=3)
        ttk.Label(self.frame, text=session.peer.label(),
                  font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=6, pady=(4, 0))

        controls = ttk.Frame(self.frame)
        controls.pack(fill="x", padx=6, pady=4)
        self._control_var = tk.BooleanVar(
            value=Permission.CONTROL in session.granted)
        if Permission.CONTROL in session.granted:
            ttk.Checkbutton(controls, text="control", variable=self._control_var,
                            command=self._toggle_control).pack(side="left")
        ttk.Button(controls, text="Disconnect",
                   command=self._disconnect).pack(side="right")

    def _toggle_control(self) -> None:
        if self._control_var.get():
            self.session.grant(Permission.CONTROL)
        else:
            self.session.revoke(Permission.CONTROL)
        try:
            self.link.send(PERMISSION_UPDATE,
                           {"granted": sorted(p.value for p in self.session.granted)})
        except Exception:
            pass
        self.log(f"control {'granted' if self._control_var.get() else 'revoked'} "
                 f"for {self.session.peer.name}")

    def _disconnect(self) -> None:
        self.session.close()
        self.link.close()
        self.log(f"disconnected {self.session.peer.name}")

    def destroy(self) -> None:
        self.frame.destroy()


def main() -> None:
    HostApp().run()


if __name__ == "__main__":
    main()
