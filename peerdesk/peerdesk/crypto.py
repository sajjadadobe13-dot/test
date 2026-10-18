"""Cryptographic helpers for PeerDesk.

Two independent concerns live here:

1. **Password authentication** for unattended access.  The password is never
   sent over the wire.  Instead the host sends a random salt + nonce, both
   sides derive a key with PBKDF2-HMAC-SHA256, and the viewer proves knowledge
   of the password by returning ``HMAC(key, nonce)``.

2. **Session confidentiality** via an authenticated-encryption channel
   (Fernet = AES-128-CBC + HMAC-SHA256) keyed from the same derived key, so
   screen frames, input and files are not readable by a passive relay.

All primitives come from the audited ``cryptography`` package; we never roll
our own ciphers.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

PBKDF2_ITERATIONS = 200_000
KEY_LEN = 32
SALT_LEN = 16
NONCE_LEN = 32


def generate_device_id() -> str:
    """Return a 9-digit device id (no leading zero), similar in spirit to the
    short numeric ids used by remote-desktop tools."""
    return str(secrets.randbelow(900_000_000) + 100_000_000)


def generate_session_token() -> str:
    """An unguessable identifier for an in-progress session."""
    return secrets.token_urlsafe(24)


def generate_password(length: int = 12) -> str:
    """Generate a human-friendly random access password."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def make_salt() -> bytes:
    return os.urandom(SALT_LEN)


def make_nonce() -> bytes:
    return os.urandom(NONCE_LEN)


def derive_key(password: str, salt: bytes,
               iterations: int = PBKDF2_ITERATIONS) -> bytes:
    """Derive a 32-byte key from a password and salt."""
    if not isinstance(salt, (bytes, bytearray)):
        raise TypeError("salt must be bytes")
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=KEY_LEN,
                     salt=bytes(salt), iterations=iterations)
    return kdf.derive(password.encode("utf-8"))


def challenge_answer(key: bytes, nonce: bytes) -> bytes:
    """Compute the proof a viewer sends back for a login challenge."""
    return hmac.new(key, nonce, hashlib.sha256).digest()


def verify_answer(key: bytes, nonce: bytes, answer: bytes) -> bool:
    """Constant-time verification of a challenge answer."""
    expected = challenge_answer(key, nonce)
    try:
        return hmac.compare_digest(expected, answer)
    except TypeError:  # pragma: no cover - defensive
        return False


class SecureChannel:
    """Authenticated encryption over a derived key.

    ``encrypt`` / ``decrypt`` operate on arbitrary bytes.  A tampered or
    truncated ciphertext raises :class:`ValueError` rather than returning
    garbage.
    """

    def __init__(self, key: bytes):
        if len(key) != KEY_LEN:
            raise ValueError(f"key must be {KEY_LEN} bytes")
        self._fernet = Fernet(base64.urlsafe_b64encode(key))

    @classmethod
    def from_password(cls, password: str, salt: bytes) -> "SecureChannel":
        return cls(derive_key(password, salt))

    def encrypt(self, data: bytes) -> bytes:
        return self._fernet.encrypt(data)

    def decrypt(self, token: bytes) -> bytes:
        try:
            return self._fernet.decrypt(token)
        except InvalidToken as exc:
            raise ValueError("ciphertext failed authentication") from exc


def generate_keypair():
    """Generate an ephemeral X25519 keypair.

    Returns ``(private_key, public_bytes)`` where ``public_bytes`` is the raw
    32-byte public key to send to the peer.
    """
    private = X25519PrivateKey.generate()
    public_bytes = private.public_key().public_bytes_raw()
    return private, public_bytes


def derive_shared_key(private_key, peer_public_bytes: bytes,
                      info: bytes = b"peerdesk-session-v1") -> bytes:
    """Derive a symmetric session key from our private key and the peer's
    public key via X25519 + HKDF-SHA256."""
    peer_public = X25519PublicKey.from_public_bytes(bytes(peer_public_bytes))
    shared = private_key.exchange(peer_public)
    return HKDF(algorithm=hashes.SHA256(), length=KEY_LEN, salt=None,
                info=info).derive(shared)


def b64e(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def b64d(text: str) -> bytes:
    return base64.b64decode(text.encode("ascii"))
