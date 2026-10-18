"""Optional rendezvous relay for connecting across NAT/firewalls.

When two machines cannot reach each other directly, both connect *out* to a
relay.  A host registers its device id; a viewer asks for that id; the relay
pairs the two sockets and then becomes a blind byte pipe.

Because PeerDesk sessions are end-to-end encrypted (X25519 + authenticated
encryption, negotiated *between the two endpoints*), the relay only ever sees
ciphertext -- it cannot read screen contents, keystrokes or files.  Running your
own relay therefore does not require trusting it with session data.

Control preamble (one PeerDesk-framed message each, before the encrypted
stream begins):
  host   -> RELAY_REGISTER {device_id}
  viewer -> RELAY_CONNECT  {device_id}
Both receive RELAY_READY once paired, after which raw bytes are forwarded.
"""

from __future__ import annotations

import socket
import threading
from typing import Dict, Optional

from . import protocol
from .link import Link

RELAY_REGISTER = "relay_register"
RELAY_CONNECT = "relay_connect"
RELAY_READY = "relay_ready"
RELAY_ERROR = "relay_error"

DEFAULT_RELAY_PORT = 7421


class RelayServer:
    def __init__(self, host: str = "0.0.0.0", port: int = DEFAULT_RELAY_PORT,
                 log=lambda m: None):
        self.host = host
        self.port = port
        self.log = log
        self._server: Optional[socket.socket] = None
        self._waiting: Dict[str, socket.socket] = {}
        self._lock = threading.Lock()
        self._running = threading.Event()

    def start(self) -> None:
        self._server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server.bind((self.host, self.port))
        self._server.listen(16)
        self._running.set()
        self.log(f"relay listening on {self.host}:{self.port}")
        while self._running.is_set():
            try:
                conn, addr = self._server.accept()
            except OSError:
                break
            threading.Thread(target=self._handle, args=(conn, addr),
                             daemon=True).start()

    def stop(self) -> None:
        self._running.clear()
        if self._server:
            try:
                self._server.close()
            except OSError:
                pass

    def _handle(self, conn: socket.socket, addr) -> None:
        buf = protocol.MessageBuffer()
        try:
            preamble = _read_one(conn, buf)
        except Exception:
            conn.close()
            return
        device_id = str(preamble.get("device_id", ""))
        if not device_id:
            _send(conn, RELAY_ERROR, {"message": "missing device_id"})
            conn.close()
            return

        if preamble.kind == RELAY_REGISTER:
            with self._lock:
                existing = self._waiting.pop(device_id, None)
                if existing:
                    try:
                        existing.close()
                    except OSError:
                        pass
                self._waiting[device_id] = conn
            self.log(f"host registered id {device_id} from {addr[0]}")
            # The host simply waits; the viewer side will pair us.

        elif preamble.kind == RELAY_CONNECT:
            with self._lock:
                host_conn = self._waiting.pop(device_id, None)
            if host_conn is None:
                _send(conn, RELAY_ERROR, {"message": "host not available"})
                conn.close()
                return
            _send(host_conn, RELAY_READY, {"device_id": device_id})
            _send(conn, RELAY_READY, {"device_id": device_id})
            self.log(f"pairing id {device_id}")
            _pipe(host_conn, conn)
        else:
            _send(conn, RELAY_ERROR, {"message": "unknown preamble"})
            conn.close()


def _read_one(sock: socket.socket, buf: protocol.MessageBuffer) -> protocol.Message:
    while True:
        msg = buf.next()
        if msg is not None:
            return msg
        chunk = sock.recv(4096)
        if not chunk:
            raise ConnectionError("closed before preamble")
        buf.feed(chunk)


def _send(sock: socket.socket, kind: str, meta: dict) -> None:
    sock.sendall(protocol.encode(kind, meta))


def _pipe(a: socket.socket, b: socket.socket) -> None:
    """Forward bytes in both directions until either side closes."""
    def forward(src, dst):
        try:
            while True:
                data = src.recv(65536)
                if not data:
                    break
                dst.sendall(data)
        except OSError:
            pass
        finally:
            for s in (src, dst):
                try:
                    s.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass

    t1 = threading.Thread(target=forward, args=(a, b), daemon=True)
    t2 = threading.Thread(target=forward, args=(b, a), daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    for s in (a, b):
        try:
            s.close()
        except OSError:
            pass


# ---------------------------------------------------------------------------
# client-side helpers
# ---------------------------------------------------------------------------
def register_host(relay_host: str, relay_port: int, device_id: str,
                  timeout: float = 15.0) -> Link:
    """Host side: connect to the relay, register, and wait to be paired.

    Returns a :class:`Link` ready to be handed to ``serve_connection`` once a
    viewer attaches.
    """
    sock = socket.create_connection((relay_host, relay_port), timeout=timeout)
    _send(sock, RELAY_REGISTER, {"device_id": device_id})
    buf = protocol.MessageBuffer()
    ready = _read_one(sock, buf)  # blocks until a viewer requests us
    if ready.kind != RELAY_READY:
        sock.close()
        raise ConnectionError(ready.get("message", "relay error"))
    sock.settimeout(None)
    return Link(sock)


def connect_viewer(relay_host: str, relay_port: int, device_id: str,
                   timeout: float = 15.0) -> Link:
    """Viewer side: connect to the relay and ask to be paired with a host."""
    sock = socket.create_connection((relay_host, relay_port), timeout=timeout)
    _send(sock, RELAY_CONNECT, {"device_id": device_id})
    buf = protocol.MessageBuffer()
    ready = _read_one(sock, buf)
    if ready.kind != RELAY_READY:
        sock.close()
        raise ConnectionError(ready.get("message", "host not available"))
    sock.settimeout(None)
    return Link(sock)
