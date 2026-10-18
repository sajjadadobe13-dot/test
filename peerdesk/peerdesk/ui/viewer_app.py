"""Viewer window: connect to a remote PeerDesk host and control it.

Flow: enter the host's address (and optional id/password), choose which rights
to request, and connect.  While the remote operator decides, the window shows a
"waiting for approval" state.  Once accepted, the remote screen renders on a
canvas and mouse/keyboard input is forwarded; a toolbar offers file transfer.
"""

from __future__ import annotations

import io
import queue
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from typing import Optional

from ..config import Config, DEFAULT_PORT
from ..link import LinkClosed
from ..relay import connect_viewer
from ..sessions import Permission
from ..viewer import AuthFailed, SessionRejected, ViewerClient
from .. import protocol


class ViewerApp:
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config.load()
        self.root = tk.Tk()
        self.root.title("PeerDesk - Connect")
        self.root.geometry("420x420")
        self.client: Optional[ViewerClient] = None
        self._frame_queue: "queue.Queue" = queue.Queue()
        self._buffer = None           # PIL.Image full remote framebuffer
        self._photo = None            # ImageTk.PhotoImage currently shown
        self._scale = 1.0
        self._offset = (0, 0)
        self._running = False
        self._build_connect()

    # -- connect screen -----------------------------------------------------
    def _build_connect(self) -> None:
        for w in self.root.winfo_children():
            w.destroy()
        pad = {"padx": 14, "pady": 6}
        ttk.Label(self.root, text="Connect to a remote computer",
                  font=("Segoe UI", 12, "bold")).pack(anchor="w", **pad)

        form = ttk.Frame(self.root)
        form.pack(fill="x", **pad)
        ttk.Label(form, text="Host address or ID:").grid(row=0, column=0, sticky="w")
        self.var_host = tk.StringVar()
        ttk.Entry(form, textvariable=self.var_host, width=28).grid(
            row=0, column=1, pady=3)
        ttk.Label(form, text="Port:").grid(row=1, column=0, sticky="w")
        self.var_port = tk.StringVar(value=str(DEFAULT_PORT))
        ttk.Entry(form, textvariable=self.var_port, width=10).grid(
            row=1, column=1, sticky="w", pady=3)
        ttk.Label(form, text="Password (if required):").grid(
            row=2, column=0, sticky="w")
        self.var_password = tk.StringVar()
        ttk.Entry(form, textvariable=self.var_password, show="*", width=28).grid(
            row=2, column=1, pady=3)

        self.var_use_relay = tk.BooleanVar(value=False)
        ttk.Checkbutton(self.root, text="Connect through relay server",
                        variable=self.var_use_relay).pack(anchor="w", **pad)

        perms = ttk.LabelFrame(self.root, text="Request permission to")
        perms.pack(fill="x", **pad)
        self.var_control = tk.BooleanVar(value=True)
        self.var_files = tk.BooleanVar(value=True)
        self.var_clip = tk.BooleanVar(value=True)
        ttk.Checkbutton(perms, text="Control keyboard & mouse",
                        variable=self.var_control).pack(anchor="w", padx=8)
        ttk.Checkbutton(perms, text="Transfer files",
                        variable=self.var_files).pack(anchor="w", padx=8)
        ttk.Checkbutton(perms, text="Share clipboard",
                        variable=self.var_clip).pack(anchor="w", padx=8)

        self.connect_btn = ttk.Button(self.root, text="Connect",
                                      command=self._connect)
        self.connect_btn.pack(pady=12)
        self.status_var = tk.StringVar(value="")
        ttk.Label(self.root, textvariable=self.status_var,
                  foreground="#06c").pack()

    def _requested_permissions(self):
        perms = {Permission.VIEW}
        if self.var_control.get():
            perms.add(Permission.CONTROL)
        if self.var_files.get():
            perms.add(Permission.FILE_TRANSFER)
        if self.var_clip.get():
            perms.add(Permission.CLIPBOARD)
        return perms

    def _connect(self) -> None:
        self.connect_btn.configure(state="disabled")
        self.status_var.set("Connecting...")
        threading.Thread(target=self._do_connect, daemon=True).start()

    def _do_connect(self) -> None:
        host = self.var_host.get().strip()
        try:
            port = int(self.var_port.get().strip() or DEFAULT_PORT)
        except ValueError:
            port = DEFAULT_PORT
        client = ViewerClient(name=self.config.device_name,
                              device_id=self.config.device_id)
        try:
            if self.var_use_relay.get():
                if not (self.config.relay_host and self.config.relay_port):
                    raise RuntimeError("no relay configured in settings")
                link = connect_viewer(self.config.relay_host,
                                      self.config.relay_port, host)
                client.attach_link(link)
            else:
                client.connect(host, port)
            self._set_status("Waiting for the remote user to accept...")
            client.negotiate(self._requested_permissions(),
                             password=self.var_password.get())
        except SessionRejected as exc:
            self._fail(f"Connection declined: {exc.reason}")
            return
        except AuthFailed:
            self._fail("Incorrect password.")
            return
        except Exception as exc:  # pragma: no cover - UI/runtime
            self._fail(f"Could not connect: {exc}")
            return
        self.client = client
        self.root.after(0, self._build_session)

    def _fail(self, message: str) -> None:
        def show():
            self.status_var.set("")
            self.connect_btn.configure(state="normal")
            messagebox.showerror("PeerDesk", message)
        self.root.after(0, show)

    def _set_status(self, message: str) -> None:
        self.root.after(0, lambda: self.status_var.set(message))

    # -- session screen -----------------------------------------------------
    def _build_session(self) -> None:
        for w in self.root.winfo_children():
            w.destroy()
        self.root.title(f"PeerDesk - {self.client.result.host_name or 'Remote'}")
        self.root.geometry("1024x720")

        toolbar = ttk.Frame(self.root)
        toolbar.pack(fill="x")
        granted = self.client.result.granted
        ttk.Label(toolbar, text="Connected -- " +
                  ", ".join(sorted(p.value for p in granted)),
                  foreground="#070").pack(side="left", padx=8, pady=4)
        if Permission.FILE_TRANSFER in granted:
            ttk.Button(toolbar, text="Send File...",
                       command=self._send_file).pack(side="right", padx=4, pady=4)
        ttk.Button(toolbar, text="Disconnect",
                   command=self._disconnect).pack(side="right", padx=4, pady=4)

        self.canvas = tk.Canvas(self.root, bg="black", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self._bind_input(granted)

        self._running = True
        threading.Thread(target=self._recv_loop, daemon=True).start()
        self.root.after(66, self._render)

    def _bind_input(self, granted) -> None:
        if Permission.CONTROL not in granted:
            return
        self.canvas.bind("<Motion>", lambda e: self._send_mouse("mouse_move", e))
        self.canvas.bind("<Button-1>", lambda e: self._send_mouse("mouse_down", e, "left"))
        self.canvas.bind("<ButtonRelease-1>", lambda e: self._send_mouse("mouse_up", e, "left"))
        self.canvas.bind("<Button-3>", lambda e: self._send_mouse("mouse_down", e, "right"))
        self.canvas.bind("<ButtonRelease-3>", lambda e: self._send_mouse("mouse_up", e, "right"))
        self.canvas.bind("<MouseWheel>",
                         lambda e: self._send_scroll(0, 1 if e.delta > 0 else -1))
        self.root.bind("<KeyPress>", lambda e: self._send_key("down", e))
        self.root.bind("<KeyRelease>", lambda e: self._send_key("up", e))
        self.canvas.focus_set()

    # -- input forwarding ---------------------------------------------------
    def _to_norm(self, event):
        if not self._buffer:
            return None
        bw, bh = self._buffer.size
        dx, dy = self._offset
        sx = (event.x - dx) / (bw * self._scale) if bw else 0
        sy = (event.y - dy) / (bh * self._scale) if bh else 0
        return max(0.0, min(1.0, sx)), max(0.0, min(1.0, sy))

    def _send_mouse(self, kind, event, button="left"):
        if not self.client:
            return
        norm = self._to_norm(event)
        payload = {"type": kind, "button": button}
        if norm:
            payload["x"], payload["y"] = norm
        self._safe_send(payload)

    def _send_scroll(self, dx, dy):
        self._safe_send({"type": "scroll", "dx": dx, "dy": dy})

    def _send_key(self, action, event):
        key = event.keysym
        self._safe_send({"type": "key", "action": action, "key": key})

    def _safe_send(self, payload):
        try:
            self.client.send_input(payload)
        except LinkClosed:
            self._disconnect()

    def _send_file(self):
        path = filedialog.askopenfilename()
        if not path:
            return
        def worker():
            try:
                self.client.send_file(path)
            except Exception as exc:  # pragma: no cover - UI
                self._set_status(f"file error: {exc}")
        threading.Thread(target=worker, daemon=True).start()

    # -- receive + render ---------------------------------------------------
    def _recv_loop(self):
        from PIL import Image
        w, h = self.client.result.screen
        self._buffer = Image.new("RGB", (max(1, w), max(1, h)), (0, 0, 0))
        while self._running:
            try:
                msg = self.client.recv(timeout=30)
            except (LinkClosed, TimeoutError):
                break
            except Exception:
                break
            if msg.kind == protocol.FRAME:
                self._frame_queue.put(msg)
            elif msg.kind == protocol.SESSION_CLOSED:
                break
            elif msg.kind == protocol.PERMISSION_UPDATE:
                self._set_status("permissions changed: " +
                                 ", ".join(msg.get("granted", [])))
        self.root.after(0, self._on_remote_closed)

    def _render(self):
        from PIL import Image, ImageTk
        updated = False
        try:
            while True:
                msg = self._frame_queue.get_nowait()
                tile = Image.open(io.BytesIO(msg.blob))
                self._buffer.paste(tile, (msg.get("x", 0), msg.get("y", 0)))
                updated = True
        except queue.Empty:
            pass
        if updated and self._buffer:
            cw = max(1, self.canvas.winfo_width())
            ch = max(1, self.canvas.winfo_height())
            bw, bh = self._buffer.size
            self._scale = min(cw / bw, ch / bh)
            disp = self._buffer.resize(
                (max(1, int(bw * self._scale)), max(1, int(bh * self._scale))))
            self._offset = ((cw - disp.size[0]) // 2, (ch - disp.size[1]) // 2)
            self._photo = ImageTk.PhotoImage(disp)
            self.canvas.delete("all")
            self.canvas.create_image(self._offset[0], self._offset[1],
                                     anchor="nw", image=self._photo)
        if self._running:
            self.root.after(66, self._render)

    def _on_remote_closed(self):
        if self._running:
            self._running = False
            messagebox.showinfo("PeerDesk", "The session has ended.")
            self._build_connect()
            self.root.geometry("420x420")

    def _disconnect(self):
        self._running = False
        if self.client:
            self.client.close()
            self.client = None
        self._build_connect()
        self.root.geometry("420x420")

    def run(self):
        self.root.mainloop()


def main() -> None:
    ViewerApp().run()


if __name__ == "__main__":
    main()
