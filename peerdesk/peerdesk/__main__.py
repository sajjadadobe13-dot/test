"""Command-line entry point.

    python -m peerdesk            # graphical launcher (choose Host or Viewer)
    python -m peerdesk host       # share this computer
    python -m peerdesk viewer     # connect to another computer
    python -m peerdesk relay      # run a headless rendezvous relay
    python -m peerdesk --version
"""

from __future__ import annotations

import argparse
import sys

from .version import APP_NAME, __version__


def _run_launcher() -> int:
    import tkinter as tk
    from tkinter import ttk

    from .config import Config
    cfg = Config.load()

    root = tk.Tk()
    root.title(f"{APP_NAME} {__version__}")
    root.geometry("360x300")

    ttk.Label(root, text=APP_NAME, font=("Segoe UI", 18, "bold")).pack(pady=(24, 2))
    ttk.Label(root, text="Secure remote desktop & file sharing",
              foreground="#666").pack()
    ttk.Label(root, text=f"Your address: {cfg.device_id}",
              font=("Consolas", 12)).pack(pady=14)

    def open_host():
        root.destroy()
        from .ui.host_app import HostApp
        HostApp(cfg).run()

    def open_viewer():
        root.destroy()
        from .ui.viewer_app import ViewerApp
        ViewerApp(cfg).run()

    ttk.Button(root, text="Share This Computer (Host)",
               command=open_host).pack(fill="x", padx=40, pady=6)
    ttk.Button(root, text="Connect to a Computer (Viewer)",
               command=open_viewer).pack(fill="x", padx=40, pady=6)
    ttk.Label(root, text=f"v{__version__}", foreground="#999").pack(side="bottom",
                                                                    pady=6)
    root.mainloop()
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="peerdesk", description=__doc__)
    parser.add_argument("--version", action="version",
                        version=f"{APP_NAME} {__version__}")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("host", help="share this computer")
    sub.add_parser("viewer", help="connect to another computer")
    relay_p = sub.add_parser("relay", help="run a rendezvous relay server")
    relay_p.add_argument("--host", default="0.0.0.0")
    relay_p.add_argument("--port", type=int, default=7421)

    args = parser.parse_args(argv)

    if args.command == "host":
        from .ui.host_app import main as host_main
        host_main()
        return 0
    if args.command == "viewer":
        from .ui.viewer_app import main as viewer_main
        viewer_main()
        return 0
    if args.command == "relay":
        from .relay import RelayServer
        server = RelayServer(host=args.host, port=args.port, log=print)
        try:
            server.start()
        except KeyboardInterrupt:
            server.stop()
        return 0

    return _run_launcher()


if __name__ == "__main__":
    sys.exit(main())
