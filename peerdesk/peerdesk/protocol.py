"""PeerDesk wire protocol.

Every message on the wire is::

    MAGIC(4) VERSION(1) FLAGS(1) JSON_LEN(4) BIN_LEN(4) | JSON | BINARY

The JSON part always carries a ``kind`` field plus message-specific metadata.
The optional binary part carries bulk data (an encoded screen tile, a file
chunk, an encrypted envelope, ...) so we never pay base64 overhead for it.

The module is deliberately free of any socket/threading code so it can be
exercised directly in unit tests with in-memory buffers.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field
from typing import Iterator, Optional

from .version import PROTOCOL_VERSION

MAGIC = b"PDSK"

# ---------------------------------------------------------------------------
# Message kinds
# ---------------------------------------------------------------------------

# Handshake / auth
HELLO = "hello"
SERVER_HELLO = "server_hello"
AUTH_CHALLENGE = "auth_challenge"
AUTH_RESPONSE = "auth_response"
AUTH_RESULT = "auth_result"

# Session negotiation (consent)
SESSION_REQUEST = "session_request"
CONSENT_PENDING = "consent_pending"
SESSION_GRANTED = "session_granted"
SESSION_REJECTED = "session_rejected"
SESSION_CLOSED = "session_closed"
PERMISSION_UPDATE = "permission_update"

# Screen streaming
FRAME = "frame"            # a single (possibly partial) screen tile; blob = image
SCREEN_INFO = "screen_info"

# Remote input
INPUT = "input"

# Clipboard
CLIPBOARD = "clipboard"

# File sharing
FILE_LIST_REQ = "file_list_req"
FILE_LIST = "file_list"
FILE_PUT_BEGIN = "file_put_begin"
FILE_CHUNK = "file_chunk"   # blob = raw bytes
FILE_PUT_END = "file_put_end"
FILE_GET_REQ = "file_get_req"
FILE_PROGRESS = "file_progress"
FILE_ERROR = "file_error"

# Control plane
PING = "ping"
PONG = "pong"
ERROR = "error"

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
FLAG_NONE = 0
FLAG_ENCRYPTED = 1 << 0   # the binary part is a crypto envelope of the real JSON+blob

_HEADER_FMT = "!4sBBII"
HEADER_SIZE = struct.calcsize(_HEADER_FMT)

# A single message may not exceed this (defends against a hostile/garbled peer
# trying to make us allocate unbounded memory).
DEFAULT_MAX_MESSAGE = 128 * 1024 * 1024  # 128 MiB


class ProtocolError(Exception):
    """Raised when bytes on the wire do not form a valid PeerDesk message."""


@dataclass
class Message:
    kind: str
    meta: dict = field(default_factory=dict)
    blob: bytes = b""
    flags: int = FLAG_NONE

    def get(self, key, default=None):
        return self.meta.get(key, default)


def encode(kind: str, meta: Optional[dict] = None, blob: bytes = b"",
           flags: int = FLAG_NONE) -> bytes:
    """Serialise a message to bytes ready to be written to a socket."""
    payload = dict(meta or {})
    payload["kind"] = kind
    json_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    header = struct.pack(_HEADER_FMT, MAGIC, PROTOCOL_VERSION, flags & 0xFF,
                         len(json_bytes), len(blob))
    return header + json_bytes + blob


class MessageBuffer:
    """Accumulates raw bytes and yields complete :class:`Message` objects.

    Usage::

        buf = MessageBuffer()
        buf.feed(chunk_from_socket)
        for message in buf:
            handle(message)
    """

    def __init__(self, max_message: int = DEFAULT_MAX_MESSAGE):
        self._buf = bytearray()
        self.max_message = max_message

    def feed(self, data: bytes) -> None:
        if data:
            self._buf.extend(data)

    @property
    def pending(self) -> int:
        return len(self._buf)

    def next(self) -> Optional[Message]:
        """Return the next complete message, or ``None`` if more bytes are needed."""
        if len(self._buf) < HEADER_SIZE:
            return None
        magic, version, flags, json_len, bin_len = struct.unpack(
            _HEADER_FMT, bytes(self._buf[:HEADER_SIZE]))
        if magic != MAGIC:
            raise ProtocolError("bad magic bytes - not a PeerDesk stream")
        if version != PROTOCOL_VERSION:
            raise ProtocolError(
                f"unsupported protocol version {version} (expected {PROTOCOL_VERSION})")
        if json_len + bin_len > self.max_message:
            raise ProtocolError("declared message size exceeds limit")
        total = HEADER_SIZE + json_len + bin_len
        if len(self._buf) < total:
            return None
        json_bytes = bytes(self._buf[HEADER_SIZE:HEADER_SIZE + json_len])
        blob = bytes(self._buf[HEADER_SIZE + json_len:total])
        del self._buf[:total]
        try:
            meta = json.loads(json_bytes.decode("utf-8")) if json_len else {}
        except (ValueError, UnicodeDecodeError) as exc:  # pragma: no cover - defensive
            raise ProtocolError(f"invalid JSON payload: {exc}") from exc
        kind = meta.pop("kind", None)
        if not kind:
            raise ProtocolError("message is missing its 'kind'")
        return Message(kind=kind, meta=meta, blob=blob, flags=flags)

    def __iter__(self) -> Iterator[Message]:
        while True:
            msg = self.next()
            if msg is None:
                return
            yield msg
