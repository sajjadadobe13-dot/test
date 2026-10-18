"""Persistent configuration and the stable device identity.

The config lives as JSON in a per-user location (``%APPDATA%\\PeerDesk`` on
Windows, ``~/.config/peerdesk`` elsewhere).  A device id is generated once on
first run and reused forever, so a host is reachable at the same id.

The whole module is parameterised on an explicit path so tests never touch the
real user profile.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from typing import Optional

from .crypto import generate_device_id
from .sessions import HostPolicy

APP_DIR_NAME = "PeerDesk"
CONFIG_FILENAME = "config.json"
DEFAULT_PORT = 7420


def config_dir() -> str:
    if os.name == "nt":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
    else:
        base = os.environ.get("XDG_CONFIG_HOME") or os.path.join(
            os.path.expanduser("~"), ".config")
    return os.path.join(base, APP_DIR_NAME)


def default_config_path() -> str:
    return os.path.join(config_dir(), CONFIG_FILENAME)


def default_download_dir() -> str:
    return os.path.join(os.path.expanduser("~"), "Downloads", "PeerDesk")


@dataclass
class Config:
    device_id: str = ""
    device_name: str = field(default_factory=lambda: _hostname())
    listen_port: int = DEFAULT_PORT
    # Host policy knobs
    require_consent: bool = True
    unattended_password: str = ""
    allow_file_transfer: bool = True
    allow_control: bool = True
    allow_clipboard: bool = True
    auto_accept: bool = False
    encrypt_sessions: bool = True
    download_dir: str = field(default_factory=default_download_dir)
    # Relay (optional rendezvous server for connecting across NAT)
    relay_host: str = ""
    relay_port: int = 0

    def __post_init__(self) -> None:
        if not self.device_id:
            self.device_id = generate_device_id()

    # -- persistence --------------------------------------------------------
    @classmethod
    def load(cls, path: Optional[str] = None) -> "Config":
        path = path or default_config_path()
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                known = {k: data[k] for k in data if k in cls.__dataclass_fields__}
                return cls(**known)
            except (OSError, ValueError):
                # Corrupt config: fall back to defaults rather than crashing.
                pass
        cfg = cls()
        cfg.save(path)
        return cfg

    def save(self, path: Optional[str] = None) -> None:
        path = path or default_config_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(asdict(self), fh, indent=2, sort_keys=True)
        os.replace(tmp, path)

    # -- derived ------------------------------------------------------------
    def host_policy(self) -> HostPolicy:
        return HostPolicy(
            require_consent=self.require_consent,
            unattended_password=self.unattended_password,
            allow_file_transfer=self.allow_file_transfer,
            allow_control=self.allow_control,
            allow_clipboard=self.allow_clipboard,
            auto_accept=self.auto_accept,
        )


def _hostname() -> str:
    try:
        import socket
        return socket.gethostname() or "PeerDesk-Host"
    except Exception:  # pragma: no cover - defensive
        return "PeerDesk-Host"
