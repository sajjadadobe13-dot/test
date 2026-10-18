"""Chunked, verified file transfer for PeerDesk.

A transfer is three phases: a ``begin`` (name + size + sha256), a stream of
fixed-size chunks, and an ``end``.  The receiver streams chunks to a temporary
file, checks the SHA-256 on completion, and only then moves the file into
place.  Partial/aborted transfers never leave a usable file behind.

Security notes:
  * The receiver sanitises the supplied name to its basename, so a malicious
    peer cannot write outside the chosen download directory (no ``..`` or
    absolute-path traversal).
  * Transfers are gated by :class:`~peerdesk.sessions.Permission.FILE_TRANSFER`
    at the host before any of this runs.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Iterator, Optional, Tuple

DEFAULT_CHUNK = 256 * 1024  # 256 KiB


class FileTransferError(Exception):
    pass


def sanitize_name(name: str) -> str:
    """Reduce an arbitrary peer-supplied name to a safe basename."""
    # Reject directory components from either path style.
    name = name.replace("\\", "/")
    base = os.path.basename(name).strip()
    # Drop anything that is still dangerous or empty.
    if not base or base in (".", ".."):
        return "received_file"
    return base


@dataclass
class FileMeta:
    name: str
    size: int
    sha256: str

    def to_dict(self) -> dict:
        return {"name": self.name, "size": self.size, "sha256": self.sha256}

    @classmethod
    def from_dict(cls, d: dict) -> "FileMeta":
        return cls(name=str(d.get("name", "")),
                   size=int(d.get("size", 0)),
                   sha256=str(d.get("sha256", "")))


def hash_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


class FileSender:
    """Reads a local file and yields ``(offset, data)`` chunks."""

    def __init__(self, path: str, chunk_size: int = DEFAULT_CHUNK):
        if not os.path.isfile(path):
            raise FileTransferError(f"not a file: {path}")
        self.path = path
        self.chunk_size = chunk_size
        self.size = os.path.getsize(path)
        self._sha = hash_file(path)

    def meta(self) -> FileMeta:
        return FileMeta(name=os.path.basename(self.path), size=self.size,
                        sha256=self._sha)

    def chunks(self) -> Iterator[Tuple[int, bytes]]:
        offset = 0
        with open(self.path, "rb") as fh:
            while True:
                data = fh.read(self.chunk_size)
                if not data:
                    break
                yield offset, data
                offset += len(data)


class FileReceiver:
    """Reassembles a file from chunks into ``dest_dir`` and verifies it."""

    def __init__(self, dest_dir: str):
        self.dest_dir = dest_dir
        os.makedirs(dest_dir, exist_ok=True)
        self._meta: Optional[FileMeta] = None
        self._tmp_path: Optional[str] = None
        self._fh = None
        self._received = 0
        self._hash = hashlib.sha256()

    @property
    def received(self) -> int:
        return self._received

    @property
    def expected_size(self) -> int:
        return self._meta.size if self._meta else 0

    def begin(self, meta: FileMeta) -> None:
        if self._fh is not None:
            raise FileTransferError("a transfer is already in progress")
        safe = sanitize_name(meta.name)
        final = os.path.join(self.dest_dir, safe)
        final = self._dedupe(final)
        self._meta = FileMeta(name=os.path.basename(final), size=meta.size,
                              sha256=meta.sha256)
        self._tmp_path = final + ".part"
        self._fh = open(self._tmp_path, "wb")
        self._received = 0
        self._hash = hashlib.sha256()
        self._final_path = final

    def chunk(self, offset: int, data: bytes) -> None:
        if self._fh is None:
            raise FileTransferError("received a chunk before begin()")
        if offset != self._received:
            expected = self._received
            self.abort()
            raise FileTransferError(
                f"out-of-order chunk: expected offset {expected}, got {offset}")
        self._fh.write(data)
        self._hash.update(data)
        self._received += len(data)
        if self._received > self.expected_size:
            self.abort()
            raise FileTransferError("peer sent more data than declared")

    def end(self) -> str:
        if self._fh is None or self._meta is None:
            raise FileTransferError("end() called with no active transfer")
        self._fh.close()
        self._fh = None
        if self._received != self._meta.size:
            self._discard_tmp()
            raise FileTransferError(
                f"size mismatch: got {self._received}, expected {self._meta.size}")
        digest = self._hash.hexdigest()
        if self._meta.sha256 and digest != self._meta.sha256:
            self._discard_tmp()
            raise FileTransferError("checksum mismatch -- file is corrupt")
        os.replace(self._tmp_path, self._final_path)
        path = self._final_path
        self._reset()
        return path

    def abort(self) -> None:
        if self._fh is not None:
            try:
                self._fh.close()
            finally:
                self._fh = None
        self._discard_tmp()
        self._reset()

    # -- helpers ------------------------------------------------------------
    def _discard_tmp(self) -> None:
        if self._tmp_path and os.path.exists(self._tmp_path):
            try:
                os.remove(self._tmp_path)
            except OSError:  # pragma: no cover - best effort
                pass

    def _reset(self) -> None:
        self._meta = None
        self._tmp_path = None
        self._received = 0
        self._hash = hashlib.sha256()

    @staticmethod
    def _dedupe(path: str) -> str:
        """Avoid clobbering an existing file: foo.txt -> foo (1).txt."""
        if not os.path.exists(path):
            return path
        root, ext = os.path.splitext(path)
        i = 1
        while os.path.exists(f"{root} ({i}){ext}"):
            i += 1
        return f"{root} ({i}){ext}"


def list_directory(path: str) -> list:
    """Return a JSON-serialisable listing of a directory for the file browser."""
    entries = []
    try:
        with os.scandir(path) as it:
            for entry in it:
                try:
                    stat = entry.stat()
                    entries.append({
                        "name": entry.name,
                        "is_dir": entry.is_dir(),
                        "size": 0 if entry.is_dir() else stat.st_size,
                        "mtime": int(stat.st_mtime),
                    })
                except OSError:
                    continue
    except OSError as exc:
        raise FileTransferError(str(exc)) from exc
    entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))
    return entries
