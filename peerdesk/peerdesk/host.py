"""The host side: the machine that is being viewed/controlled.

``serve_connection`` runs the full server-side protocol over a :class:`Link`:
key exchange, optional password auth, consent negotiation, then the live
session (screen frames out, input/files/clipboard in).  Every privileged action
is gated on ``session.allows(permission)`` so a viewer can never do more than
the operator approved, and approval evaporates when the connection ends.

``ScreenHost`` binds a listening socket and serves each inbound connection on
its own thread.

The function takes its screen source, input sink and consent provider as
arguments, so an integration test can drive the whole protocol with fakes and
no real display.
"""

from __future__ import annotations

import socket
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

from . import crypto, protocol
from .capture import ScreenFrameSource
from .filetransfer import FileMeta, FileReceiver, FileSender, FileTransferError, list_directory
from .inputctrl import InputSink, SystemInputController
from .link import Link, LinkClosed
from .sessions import ConsentProvider, HostPolicy, Peer, Permission, Session
from .version import PROTOCOL_VERSION

FrameSourceFactory = Callable[[], object]
LogFn = Callable[[str], None]
TARGET_FPS = 12


@dataclass
class HostContext:
    device_id: str
    device_name: str
    policy: HostPolicy
    consent_provider: ConsentProvider
    download_dir: str
    frame_source_factory: FrameSourceFactory = ScreenFrameSource
    input_sink: Optional[InputSink] = None
    encrypt: bool = True
    target_fps: int = TARGET_FPS
    log: LogFn = lambda msg: None
    # UI hooks. on_session fires when a request arrives (still pending);
    # on_active fires once approved, handing over the live Link so the UI can
    # force-disconnect or push permission updates; on_closed fires at teardown.
    on_session: Optional[Callable[[Session], None]] = None
    on_active: Optional[Callable[[Session, "Link"], None]] = None
    on_closed: Optional[Callable[[Session], None]] = None


class _Pump(threading.Thread):
    """Background thread that pushes screen tiles to the viewer."""

    def __init__(self, link: Link, frame_source, fps: int, log: LogFn):
        super().__init__(daemon=True)
        self._link = link
        self._src = frame_source
        self._interval = 1.0 / max(1, fps)
        self._stop = threading.Event()
        self._log = log
        self._seq = 0

    def run(self) -> None:
        try:
            while not self._stop.is_set():
                start = time.monotonic()
                try:
                    tiles = self._src.next_tiles()
                except Exception as exc:  # pragma: no cover - capture errors
                    self._log(f"capture error: {exc}")
                    break
                for tile in tiles:
                    self._seq += 1
                    self._link.send(protocol.FRAME, tile.meta(self._seq), tile.data)
                elapsed = time.monotonic() - start
                self._stop.wait(max(0.0, self._interval - elapsed))
        except LinkClosed:
            pass

    def stop(self) -> None:
        self._stop.set()


def serve_connection(link: Link, ctx: HostContext,
                     peer_address: str = "") -> None:
    """Run one host-side session to completion, then clean up."""
    session: Optional[Session] = None
    pump: Optional[_Pump] = None
    receiver: Optional[FileReceiver] = None
    try:
        # 1. Handshake + key exchange (cleartext) --------------------------
        hello = link.recv(timeout=30)
        if hello.kind != protocol.HELLO:
            link.send(protocol.ERROR, {"message": "expected hello"})
            return
        viewer = Peer(name=str(hello.get("name", "Unknown")),
                      device_id=str(hello.get("device_id", "")),
                      address=peer_address or link.peer_address())
        private_key, public_bytes = crypto.generate_keypair()
        auth_required = bool(ctx.policy.unattended_password)
        link.send(protocol.SERVER_HELLO, {
            "name": ctx.device_name,
            "device_id": ctx.device_id,
            "protocol": PROTOCOL_VERSION,
            "auth_required": auth_required,
            "pubkey": crypto.b64e(public_bytes),
        })
        if ctx.encrypt and hello.get("pubkey"):
            shared = crypto.derive_shared_key(private_key,
                                              crypto.b64d(hello.get("pubkey")))
            link.enable_encryption(crypto.SecureChannel(shared))
            ctx.log(f"encrypted channel established with {viewer.label()}")

        # 2. Optional password authentication ------------------------------
        if auth_required:
            if not _authenticate(link, ctx):
                ctx.log(f"authentication failed for {viewer.label()}")
                return

        # 3. Session request + consent -------------------------------------
        req = link.recv(timeout=60)
        if req.kind != protocol.SESSION_REQUEST:
            link.send(protocol.ERROR, {"message": "expected session_request"})
            return
        requested = ctx.policy.filter_requested(
            Permission.from_list(req.get("permissions", [])))
        session = Session(peer=viewer, requested=requested)
        if ctx.on_session:
            ctx.on_session(session)
        link.send(protocol.CONSENT_PENDING,
                  {"message": "waiting for operator approval"})
        ctx.log(f"{viewer.label()} requests: "
                f"{sorted(p.value for p in requested)}")

        granted = ctx.consent_provider(session)
        if not granted:
            session.reject()
            link.send(protocol.SESSION_REJECTED,
                      {"reason": session.reject_reason or "declined"})
            ctx.log(f"session with {viewer.label()} declined")
            return
        session.approve(granted)
        w, h = _screen_size(ctx)
        link.send(protocol.SESSION_GRANTED, {
            "session_id": session.id,
            "granted": sorted(p.value for p in session.granted),
            "screen": {"width": w, "height": h},
        })
        ctx.log(f"session with {viewer.label()} approved: "
                f"{sorted(p.value for p in session.granted)}")
        if ctx.on_active:
            ctx.on_active(session, link)

        # 4. Start streaming screen ----------------------------------------
        frame_source = _resolve_frame_source(ctx)
        input_sink = ctx.input_sink or SystemInputController(size=(w, h))
        pump = _Pump(link, frame_source, ctx.target_fps, ctx.log)
        pump.start()

        # 5. Main input/file/clipboard loop --------------------------------
        while True:
            try:
                msg = link.recv()
            except (LinkClosed, TimeoutError):
                break
            if session.state.name != "ACTIVE":
                break

            if msg.kind == protocol.INPUT:
                if session.allows(Permission.CONTROL):
                    try:
                        input_sink.apply(msg.meta)
                    except Exception as exc:  # pragma: no cover - platform
                        ctx.log(f"input error: {exc}")
                # else: silently ignored -- viewer has only VIEW rights

            elif msg.kind == protocol.CLIPBOARD:
                if session.allows(Permission.CLIPBOARD):
                    _set_clipboard(msg.get("text", ""), ctx)

            elif msg.kind in (protocol.FILE_PUT_BEGIN, protocol.FILE_CHUNK,
                              protocol.FILE_PUT_END, protocol.FILE_LIST_REQ,
                              protocol.FILE_GET_REQ):
                if not session.allows(Permission.FILE_TRANSFER):
                    link.send(protocol.FILE_ERROR,
                              {"message": "file transfer not permitted"})
                    continue
                receiver = _handle_file_message(link, ctx, msg, receiver)

            elif msg.kind == protocol.PING:
                link.send(protocol.PONG, {"t": msg.get("t")})

            elif msg.kind == protocol.SESSION_CLOSED:
                break

    except (LinkClosed, TimeoutError, protocol.ProtocolError) as exc:
        ctx.log(f"connection ended: {exc}")
    finally:
        if pump:
            pump.stop()
        if receiver:
            receiver.abort()
        if session:
            session.close()  # one-time: all grants dropped here
            if ctx.on_closed:
                try:
                    ctx.on_closed(session)
                except Exception:
                    pass
        try:
            link.send(protocol.SESSION_CLOSED, {})
        except Exception:
            pass
        link.close()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _authenticate(link: Link, ctx: HostContext) -> bool:
    salt = crypto.make_salt()
    nonce = crypto.make_nonce()
    link.send(protocol.AUTH_CHALLENGE,
              {"salt": crypto.b64e(salt), "nonce": crypto.b64e(nonce)})
    resp = link.recv(timeout=30)
    if resp.kind != protocol.AUTH_RESPONSE:
        link.send(protocol.AUTH_RESULT, {"ok": False})
        return False
    key = crypto.derive_key(ctx.policy.unattended_password, salt)
    ok = crypto.verify_answer(key, nonce, crypto.b64d(resp.get("answer", "")))
    link.send(protocol.AUTH_RESULT, {"ok": ok})
    return ok


def _handle_file_message(link: Link, ctx: HostContext, msg: protocol.Message,
                         receiver: Optional[FileReceiver]) -> Optional[FileReceiver]:
    try:
        if msg.kind == protocol.FILE_PUT_BEGIN:
            receiver = FileReceiver(ctx.download_dir)
            receiver.begin(FileMeta.from_dict(msg.meta))
            ctx.log(f"receiving file: {msg.get('name')}")
        elif msg.kind == protocol.FILE_CHUNK:
            if receiver:
                receiver.chunk(int(msg.get("offset", 0)), msg.blob)
        elif msg.kind == protocol.FILE_PUT_END:
            if receiver:
                path = receiver.end()
                receiver = None
                link.send(protocol.FILE_PROGRESS, {"done": True, "path": path})
                ctx.log(f"file saved: {path}")
        elif msg.kind == protocol.FILE_LIST_REQ:
            path = msg.get("path") or ctx.download_dir
            link.send(protocol.FILE_LIST,
                      {"path": path, "entries": list_directory(path)})
        elif msg.kind == protocol.FILE_GET_REQ:
            _send_file(link, msg.get("path", ""))
    except FileTransferError as exc:
        link.send(protocol.FILE_ERROR, {"message": str(exc)})
        if receiver:
            receiver.abort()
            receiver = None
    return receiver


def _send_file(link: Link, path: str) -> None:
    sender = FileSender(path)
    link.send(protocol.FILE_PUT_BEGIN, sender.meta().to_dict())
    for offset, data in sender.chunks():
        link.send(protocol.FILE_CHUNK, {"offset": offset}, blob=data)
    link.send(protocol.FILE_PUT_END, {})


def _resolve_frame_source(ctx: HostContext):
    src = ctx.frame_source_factory()
    return src


def _screen_size(ctx: HostContext):
    try:
        src = ctx.frame_source_factory()
        if hasattr(src, "screen_size"):
            size = src.screen_size()
            if size and size != (0, 0):
                return size
    except Exception:  # pragma: no cover - platform
        pass
    return (1920, 1080)


def _set_clipboard(text: str, ctx: HostContext) -> None:
    try:
        import pyperclip  # type: ignore
        pyperclip.copy(text)
    except Exception:  # pragma: no cover - optional dependency
        ctx.log("clipboard sync unavailable (install pyperclip)")


class ScreenHost:
    """Listens for viewer connections and serves each on its own thread."""

    def __init__(self, ctx: HostContext, host: str = "0.0.0.0",
                 port: int = 7420):
        self.ctx = ctx
        self.host = host
        self.port = port
        self._server: Optional[socket.socket] = None
        self._thread: Optional[threading.Thread] = None
        self._running = threading.Event()

    def start(self) -> None:
        self._server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server.bind((self.host, self.port))
        self._server.listen(5)
        self._running.set()
        self._thread = threading.Thread(target=self._accept_loop, daemon=True)
        self._thread.start()
        self.ctx.log(f"PeerDesk host listening on {self.host}:{self.port} "
                     f"(id {self.ctx.device_id})")

    def _accept_loop(self) -> None:
        assert self._server is not None
        while self._running.is_set():
            try:
                conn, addr = self._server.accept()
            except OSError:
                break
            self.ctx.log(f"incoming connection from {addr[0]}:{addr[1]}")
            link = Link(conn)
            threading.Thread(
                target=serve_connection,
                args=(link, self.ctx, f"{addr[0]}:{addr[1]}"),
                daemon=True,
            ).start()

    def stop(self) -> None:
        self._running.clear()
        if self._server:
            try:
                self._server.close()
            except OSError:
                pass
        self.ctx.log("PeerDesk host stopped")
