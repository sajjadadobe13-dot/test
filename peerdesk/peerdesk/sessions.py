"""The consent and permission model -- the heart of PeerDesk's safety story.

A connection does **not** grant any rights.  A viewer asks for a set of
permissions; the host operator must explicitly approve them in a dialog.  Once
approved, the rights live only on the in-memory :class:`Session` object and are
discarded the moment the connection ends, so every new connection starts from
zero.  This is the "one-time permission to control" behaviour: approval is
scoped to the single session in front of the operator, never remembered.

The operator can also narrow what was requested (e.g. grant VIEW but withhold
CONTROL) and can revoke any permission mid-session.

Nothing in this module touches the network or the screen, so the entire policy
is unit-testable.
"""

from __future__ import annotations

import enum
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, Optional, Set

from .crypto import generate_session_token


class Permission(str, enum.Enum):
    VIEW = "view"                    # see the remote screen
    CONTROL = "control"              # move mouse / type on the remote
    FILE_TRANSFER = "file_transfer"  # browse and transfer files
    CLIPBOARD = "clipboard"          # share clipboard text
    AUDIO = "audio"                  # stream remote audio (reserved)

    @classmethod
    def from_list(cls, values: Iterable[str]) -> Set["Permission"]:
        out: Set[Permission] = set()
        for v in values:
            try:
                out.add(cls(v))
            except ValueError:
                continue  # ignore unknown permissions from other versions
        return out


# What a viewer asks for by default.
DEFAULT_REQUESTED: Set[Permission] = {Permission.VIEW, Permission.CONTROL,
                                      Permission.FILE_TRANSFER, Permission.CLIPBOARD}


class SessionState(str, enum.Enum):
    PENDING = "pending"    # waiting for the operator to decide
    ACTIVE = "active"      # operator approved; streaming
    REJECTED = "rejected"  # operator declined
    CLOSED = "closed"      # finished / disconnected


@dataclass
class Peer:
    name: str = "Unknown"
    device_id: str = ""
    address: str = ""

    def label(self) -> str:
        who = self.name or "Unknown"
        if self.device_id:
            who += f" ({self.device_id})"
        if self.address:
            who += f" @ {self.address}"
        return who


@dataclass
class Session:
    peer: Peer
    requested: Set[Permission]
    id: str = field(default_factory=generate_session_token)
    granted: Set[Permission] = field(default_factory=set)
    state: SessionState = SessionState.PENDING
    created_at: float = field(default_factory=time.time)
    decided_at: Optional[float] = None
    closed_at: Optional[float] = None
    reject_reason: str = ""

    # -- operator decisions -------------------------------------------------
    def approve(self, granted: Optional[Iterable[Permission]] = None) -> None:
        """Approve the session, granting at most what was requested.

        ``granted=None`` means "grant everything the viewer asked for".
        VIEW is always included so an approved session can at least show the
        screen.
        """
        if self.state not in (SessionState.PENDING,):
            raise RuntimeError(f"cannot approve a session in state {self.state}")
        chosen = set(self.requested) if granted is None else set(granted)
        chosen &= self.requested          # never grant more than requested
        chosen.add(Permission.VIEW)       # an active session always sees screen
        self.granted = chosen
        self.state = SessionState.ACTIVE
        self.decided_at = time.time()

    def reject(self, reason: str = "declined by operator") -> None:
        if self.state not in (SessionState.PENDING,):
            raise RuntimeError(f"cannot reject a session in state {self.state}")
        self.state = SessionState.REJECTED
        self.reject_reason = reason
        self.decided_at = time.time()

    def grant(self, perm: Permission) -> None:
        """Add a permission mid-session (operator opened up more access)."""
        if self.state is not SessionState.ACTIVE:
            raise RuntimeError("can only change permissions on an active session")
        self.granted.add(perm)

    def revoke(self, perm: Permission) -> None:
        """Remove a permission mid-session.  VIEW cannot be revoked without
        closing the session (closing is the right tool for 'stop everything')."""
        if self.state is not SessionState.ACTIVE:
            raise RuntimeError("can only change permissions on an active session")
        if perm is Permission.VIEW:
            raise ValueError("revoke VIEW by closing the session instead")
        self.granted.discard(perm)

    def close(self) -> None:
        self.state = SessionState.CLOSED
        self.granted = set()      # one-time: nothing survives the session
        self.closed_at = time.time()

    # -- enforcement --------------------------------------------------------
    def allows(self, perm: Permission) -> bool:
        """True only if the session is active and the permission is granted.

        Host message handlers MUST gate every privileged action on this.
        """
        return self.state is SessionState.ACTIVE and perm in self.granted


@dataclass
class HostPolicy:
    """Host-side defaults that shape how incoming sessions are handled."""

    require_consent: bool = True          # prompt the operator for every session
    unattended_password: str = ""         # if set, enables password login
    allow_file_transfer: bool = True      # operator may still withhold per session
    allow_control: bool = True
    allow_clipboard: bool = True
    auto_accept: bool = False             # DANGEROUS; only with explicit opt-in

    def filter_requested(self, requested: Set[Permission]) -> Set[Permission]:
        """Drop permissions the host forbids outright, before the operator even
        sees the request."""
        allowed = {Permission.VIEW}
        if self.allow_control:
            allowed.add(Permission.CONTROL)
        if self.allow_file_transfer:
            allowed.add(Permission.FILE_TRANSFER)
        if self.allow_clipboard:
            allowed.add(Permission.CLIPBOARD)
        allowed.add(Permission.AUDIO)
        return set(requested) & allowed


# A consent provider is given a pending Session and must return the set of
# permissions to grant (possibly empty -> treated as rejection), or None to
# reject outright.  The host UI supplies a blocking implementation that pops a
# dialog; tests supply a function.
ConsentProvider = Callable[[Session], Optional[Set[Permission]]]


class SessionRegistry:
    """Tracks the live sessions a host is serving (usually just one)."""

    def __init__(self) -> None:
        self._sessions: Dict[str, Session] = {}

    def add(self, session: Session) -> None:
        self._sessions[session.id] = session

    def get(self, session_id: str) -> Optional[Session]:
        return self._sessions.get(session_id)

    def remove(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def active(self) -> Iterable[Session]:
        return [s for s in self._sessions.values()
                if s.state is SessionState.ACTIVE]

    def __len__(self) -> int:
        return len(self._sessions)
