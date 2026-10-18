"""PeerDesk - consent-first remote desktop and file sharing.

PeerDesk lets one computer (the *viewer*) see and optionally control another
computer (the *host*), and transfer files between them.  Every session must be
explicitly accepted on the host, and control/file-transfer rights are granted
per session only -- they are never remembered across connections unless the
operator deliberately configures unattended access.

This package is split into a headless, fully testable *core* (protocol, crypto,
sessions, filetransfer, config) and a *runtime* layer (capture, inputctrl, host,
viewer, relay, ui) that depends on the local display and OS.
"""

from .version import __version__, PROTOCOL_VERSION, APP_NAME

__all__ = ["__version__", "PROTOCOL_VERSION", "APP_NAME"]
