"""The viewer side: the machine that connects to and controls a host.

``ViewerClient`` performs the client half of the protocol -- connect, key
exchange, optional password login, then the consent negotiation -- and then
exposes a simple API the UI loop uses: receive screen frames, send input,
transfer files.

The negotiation is synchronous (it blocks until the host operator accepts or
declines), which maps naturally onto the viewer UI showing a "waiting for the
remote user to accept" state.
"""

from __future__ import annotations

import socket
from dataclasses import dataclass, field
from typing import List, Optional, Set

from . import crypto, protocol
from .filetransfer import FileMeta, FileReceiver, FileSender
from .link import Link, LinkClosed
from .sessions import DEFAULT_REQUESTED, Permission
from .version import PROTOCOL_VERSION


class SessionRejected(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class AuthFailed(Exception):
    pass


@dataclass
class NegotiationResult:
    session_id: str
    granted: Set[Permission]
    screen: tuple = (0, 0)
    host_name: str = ""
    host_id: str = ""


class ViewerClient:
    def __init__(self, name: str = "PeerDesk Viewer", device_id: str = ""):
        self.name = name
        self.device_id = device_id
        self._link: Optional[Link] = None
        self._private_key = None
        self.result: Optional[NegotiationResult] = None

    # -- connection ---------------------------------------------------------
    def connect(self, host: str, port: int, timeout: float = 15.0) -> None:
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.settimeout(None)
        self._link = Link(sock)

    def attach_link(self, link: Link) -> None:
        """Use an already-connected :class:`Link` (e.g. via a relay or in tests)."""
        self._link = link

    @property
    def link(self) -> Link:
        if self._link is None:
            raise RuntimeError("not connected")
        return self._link

    # -- handshake + consent ------------------------------------------------
    def negotiate(self, requested: Optional[Set[Permission]] = None,
                  password: str = "") -> NegotiationResult:
        requested = requested or set(DEFAULT_REQUESTED)
        self._private_key, public_bytes = crypto.generate_keypair()

        self.link.send(protocol.HELLO, {
            "name": self.name,
            "device_id": self.device_id,
            "protocol": PROTOCOL_VERSION,
            "pubkey": crypto.b64e(public_bytes),
        })
        server_hello = self.link.recv(timeout=30)
        if server_hello.kind != protocol.SERVER_HELLO:
            raise protocol.ProtocolError("expected server_hello")

        if server_hello.get("pubkey"):
            shared = crypto.derive_shared_key(
                self._private_key, crypto.b64d(server_hello.get("pubkey")))
            self.link.enable_encryption(crypto.SecureChannel(shared))

        if server_hello.get("auth_required"):
            self._authenticate(password)

        self.link.send(protocol.SESSION_REQUEST,
                       {"permissions": sorted(p.value for p in requested)})

        # The host may send CONSENT_PENDING before the operator decides.
        while True:
            msg = self.link.recv(timeout=600)
            if msg.kind == protocol.CONSENT_PENDING:
                continue
            if msg.kind == protocol.SESSION_REJECTED:
                raise SessionRejected(msg.get("reason", "declined"))
            if msg.kind == protocol.SESSION_GRANTED:
                screen = msg.get("screen", {}) or {}
                self.result = NegotiationResult(
                    session_id=msg.get("session_id", ""),
                    granted=Permission.from_list(msg.get("granted", [])),
                    screen=(screen.get("width", 0), screen.get("height", 0)),
                    host_name=server_hello.get("name", ""),
                    host_id=server_hello.get("device_id", ""),
                )
                return self.result
            raise protocol.ProtocolError(
                f"unexpected message during negotiation: {msg.kind}")

    def _authenticate(self, password: str) -> None:
        challenge = self.link.recv(timeout=30)
        if challenge.kind != protocol.AUTH_CHALLENGE:
            raise protocol.ProtocolError("expected auth_challenge")
        salt = crypto.b64d(challenge.get("salt", ""))
        nonce = crypto.b64d(challenge.get("nonce", ""))
        key = crypto.derive_key(password, salt)
        answer = crypto.challenge_answer(key, nonce)
        self.link.send(protocol.AUTH_RESPONSE, {"answer": crypto.b64e(answer)})
        result = self.link.recv(timeout=30)
        if result.kind != protocol.AUTH_RESULT or not result.get("ok"):
            raise AuthFailed("incorrect password")

    # -- live session -------------------------------------------------------
    def recv(self, timeout: Optional[float] = None) -> protocol.Message:
        return self.link.recv(timeout=timeout)

    def send_input(self, event: dict) -> None:
        self.link.send(protocol.INPUT, event)

    def send_clipboard(self, text: str) -> None:
        self.link.send(protocol.CLIPBOARD, {"text": text})

    def send_file(self, path: str) -> None:
        """Push a local file to the host's download directory."""
        sender = FileSender(path)
        meta = sender.meta()
        self.link.send(protocol.FILE_PUT_BEGIN, meta.to_dict())
        for offset, data in sender.chunks():
            self.link.send(protocol.FILE_CHUNK, {"offset": offset}, blob=data)
        self.link.send(protocol.FILE_PUT_END, {"name": meta.name})

    def request_file_list(self, path: str = "") -> None:
        self.link.send(protocol.FILE_LIST_REQ, {"path": path})

    def request_file(self, path: str) -> None:
        self.link.send(protocol.FILE_GET_REQ, {"path": path})

    def ping(self) -> None:
        self.link.send(protocol.PING, {"t": 0})

    def close(self) -> None:
        if self._link is not None:
            try:
                self._link.send(protocol.SESSION_CLOSED, {})
            except Exception:
                pass
            self._link.close()


@dataclass
class DownloadState:
    """Helper the UI uses to reassemble a file the host is sending back."""
    receiver: Optional[FileReceiver] = None
    completed: List[str] = field(default_factory=list)

    def feed(self, msg: protocol.Message, dest_dir: str) -> Optional[str]:
        if msg.kind == protocol.FILE_PUT_BEGIN:
            self.receiver = FileReceiver(dest_dir)
            self.receiver.begin(FileMeta.from_dict(msg.meta))
        elif msg.kind == protocol.FILE_CHUNK and self.receiver:
            self.receiver.chunk(int(msg.get("offset", 0)), msg.blob)
        elif msg.kind == protocol.FILE_PUT_END and self.receiver:
            path = self.receiver.end()
            self.receiver = None
            self.completed.append(path)
            return path
        return None
