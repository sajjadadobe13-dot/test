# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller build spec for PeerDesk (Windows, one-folder).

Build with:
    pyinstaller installer/peerdesk.spec --noconfirm

Produces dist/PeerDesk/PeerDesk.exe plus its support files, which the Inno
Setup script then wraps in an installer wizard.
"""

import os

block_cipher = None

# Resolve paths relative to this spec file so the build works from any CWD.
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(SPEC)), ".."))
ENTRY = os.path.join(ROOT, "installer", "peerdesk_entry.py")
ICON = os.path.join(ROOT, "installer", "assets", "peerdesk.ico")
VERSION_FILE = os.path.join(ROOT, "installer", "file_version_info.txt")

# pynput and Pillow's Tk bridge load backend modules dynamically; name them so
# PyInstaller does not strip them out of the frozen build.
hidden = [
    "pynput.keyboard._win32",
    "pynput.mouse._win32",
    "PIL._tkinter_finder",
    "PIL.ImageTk",
]

a = Analysis(
    [ENTRY],
    pathex=[ROOT],
    binaries=[],
    datas=[],
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    excludes=["pytest"],
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="PeerDesk",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,                       # GUI app: no console window
    icon=ICON if os.path.exists(ICON) else None,
    version=VERSION_FILE if os.path.exists(VERSION_FILE) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="PeerDesk",
)
