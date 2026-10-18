# PeerDesk — Build & Deployment

Phase 5 of the SDLC. How to turn the source tree into a Windows installer, and
how it is delivered and maintained.

## 1. Prerequisites (build machine, Windows 10/11 x64)

- Python 3.9+ on `PATH` (3.11+ recommended).
- [Inno Setup 6](https://jrsoftware.org/isdl.php) for the wizard (`ISCC.exe`).
- Internet access for `pip` to fetch dependencies (first build only).

## 2. One-command build

From the repository root in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File installer\build_windows.ps1
```

This script:
1. creates `.venv` and installs `requirements-dev.txt`,
2. runs the unit test suite (and **aborts the build if any test fails**),
3. generates `installer\assets\peerdesk.ico` if missing,
4. freezes the app with PyInstaller → `dist\PeerDesk\PeerDesk.exe` (+ runtime),
5. compiles the installer → `dist\installer\PeerDesk-1.0.0-Setup.exe`.

## 3. Manual build (equivalent steps)

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m unittest discover -s tests
.\.venv\Scripts\python installer\make_icon.py installer\assets\peerdesk.ico
.\.venv\Scripts\python -m PyInstaller installer\peerdesk.spec --noconfirm --clean
ISCC.exe installer\peerdesk.iss
```

## 4. What the installer does

Driven by `installer\peerdesk.iss`:

- installs to `C:\Program Files\PeerDesk` (per-machine, admin),
- Start-menu shortcuts: PeerDesk, PeerDesk (Host), PeerDesk (Viewer), Uninstall,
- optional **desktop** shortcut,
- optional **firewall** rule (inbound TCP 7420) via `netsh`,
- optional **autostart** of the host at sign-in (HKCU `Run` key),
- a working **uninstaller** that removes files and the firewall rule,
- offer to launch on finish.

End users do **not** need Python installed — it is bundled by PyInstaller.

## 5. Code signing (recommended for distribution)

Unsigned executables trigger SmartScreen warnings. With an Authenticode
certificate:

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 ^
    /f mycert.pfx /p <pwd> dist\PeerDesk\PeerDesk.exe
# then compile the installer and sign it too:
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 ^
    /f mycert.pfx /p <pwd> dist\installer\PeerDesk-1.0.0-Setup.exe
```

Add `SignTool` directives to the `.iss` to sign automatically during compile.

## 6. CI outline

A minimal pipeline (GitHub Actions or similar):

```yaml
jobs:
  test:
    strategy: { matrix: { os: [windows-latest, ubuntu-latest] } }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r requirements.txt
      - run: python -m unittest discover -s tests
  build-windows:
    needs: test
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
      - run: pip install -r requirements-dev.txt
      - run: pyinstaller installer/peerdesk.spec --noconfirm --clean
      # install Inno Setup, then: ISCC installer\peerdesk.iss
      - uses: actions/upload-artifact@v4
        with: { name: PeerDesk-Setup, path: dist/installer/*.exe }
```

(Linux runs the core/integration/relay tests; the Windows job also freezes and
packages.)

## 7. Versioning & release

- Bump `peerdesk/version.py` (`__version__`), `pyproject.toml`,
  `installer/file_version_info.txt`, and `#define MyAppVersion` in the `.iss` —
  keep them in lock-step.
- Protocol-breaking changes bump `PROTOCOL_VERSION`; the handshake rejects a
  mismatched peer rather than misbehaving.
- Tag the release, attach the signed `PeerDesk-<ver>-Setup.exe`, and publish the
  SHA-256 of the installer for verification.

## 8. Rollback / maintenance

- The installer is side-by-side-safe per version; keep the previous
  `Setup.exe` to reinstall if a release regresses.
- User config/device id survive upgrades (stored in `%APPDATA%\PeerDesk`).
