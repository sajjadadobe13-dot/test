"""Socket transport that speaks the PeerDesk protocol, with optional transparent
end-to-end encryption.

A :class:`Link` wraps a connected socket.  You ``send(kind, meta, blob)`` and
``recv()`` :class:`~peerdesk.protocol.Message` objects.  After both ends perform
an X25519 key exchange you call :meth:`enable_encryption`; from then on every
outgoing message is sealed into an authenticated-encryption envelope and every
incoming one is opened, so the rest of the application never deals with
ciphertext.

The encryption is symmetric and order-preserving, so it round-trips cleanly over
any ordered byte stream (TCP, a relay, a socketpair in tests).
"""

from __future__ import annotations

import socket
import threading
from typing import Optional

from . import protocol
from .crypto import SecureChannel


class LinkClosed(Exception):
    pass


class Link:
    def __init__(self, sock: socket.socket):
        self._sock = sock
        self._buf = protocol.MessageBuffer()
        self._channel: Optional[SecureChannel] = None
        self._send_lock = threading.Lock()
        self._recv_lock = threading.Lock()
        self._closed = False

    # -- encryption ---------------------------------------------------------
    def enable_encryption(self, channel: SecureChannel) -> None:
        self._channel = channel

    @property
    def encrypted(self) -> bool:
        return self._channel is not None

    # -- send ---------------------------------------------------------------
    def send(self, kind: str, meta: Optional[dict] = None, blob: bytes = b"") -> None:
        plain = protocol.encode(kind, meta, blob)
        if self._channel is not None:
            sealed = self._channel.encrypt(plain)
            wire = protocol.encode(kind, {"enc": 1}, blob=sealed,
                                   flags=protocol.FLAG_ENCRYPTED)
        else:
            wire = plain
        with self._send_lock:
            if self._closed:
                raise LinkClosed("link is closed")
            try:
                self._sock.sendall(wire)
            except OSError as exc:
                self._closed = True
                raise LinkClosed(str(exc)) from exc

    # -- receive ------------------------------------------------------------
    def recv(self, timeout: Optional[float] = None) -> protocol.Message:
        """Block until one complete message is available and return it."""
        if timeout is not None:
            self._sock.settimeout(timeout)
        with self._recv_lock:
            while True:
                msg = self._buf.next()
                if msg is not None:
                    return self._maybe_decrypt(msg)
                try:
                    chunk = self._sock.recv(65536)
                except socket.timeout as exc:
                    raise TimeoutError("no message within timeout") from exc
                except OSError as exc:
                    self._closed = True
                    raise LinkClosed(str(exc)) from exc
                if not chunk:
                    self._closed = True
                    raise LinkClosed("peer closed the connection")
                self._buf.feed(chunk)

    def _maybe_decrypt(self, msg: protocol.Message) -> protocol.Message:
        if not (msg.flags & protocol.FLAG_ENCRYPTED):
            return msg
        if self._channel is None:
            raise LinkClosed("received encrypted message before key exchange")
        plain = self._channel.decrypt(msg.blob)
        inner = protocol.MessageBuffer()
        inner.feed(plain)
        decoded = inner.next()
        if decoded is None:
            raise protocol.ProtocolError("malformed encrypted envelope")
        return decoded

    # -- lifecycle ----------------------------------------------------------
    def close(self) -> None:
        self._closed = True
        try:
            self._sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            self._sock.close()
        except OSError:
            pass

    @property
    def closed(self) -> bool:
        return self._closed

    def peer_address(self) -> str:
        try:
            host, port = self._sock.getpeername()[:2]
            return f"{host}:{port}"
        except OSError:
            return "unknown"
