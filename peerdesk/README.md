# PeerDesk

**Consent-first remote desktop & file sharing.** See and, with permission,
control another computer, and move files between the two — over a LAN or across
the internet through a relay. Every session is end-to-end encrypted, and the
person being helped approves each connection and can end it at any time.

> PeerDesk is an original, independent project. It is not affiliated with,
> derived from, or a drop-in replacement for any commercial product.

---

## Why "consent-first"?

Remote-control software is only safe when the person at the far end stays in
control. PeerDesk builds that in:

- 🔐 **Approve every session** — a dialog on the host shows exactly *who* is
  connecting and *what* they can do; nothing streams until the operator accepts.
- 🎚️ **Grant a subset** — allow viewing but not control, or control but not
  files, per session.
- ⏱️ **One-time by default** — permissions are discarded on disconnect; the next
  connection asks again. Nothing is silently remembered.
- 🛑 **Revoke instantly** — turn off control or disconnect mid-session.
- 👁️ **No stealth mode** — an active session is always visible on the host.
- ♾️ **No artificial limits** — no session timers, no connection caps, no trial.

## Features

- Live screen viewing with change-only (tiled) updates
- Remote keyboard & mouse control (resolution-independent)
- Bidirectional, checksum-verified file transfer
- Clipboard text sharing
- Optional unattended (password) access — password never sent in clear
- Optional rendezvous **relay** for NAT traversal (sees only ciphertext)
- End-to-end encryption: X25519 key exchange + authenticated encryption
- Windows installer wizard (shortcuts, firewall rule, autostart, uninstaller)

## Quick start (from source)

```bash
cd peerdesk
python -m pip install -r requirements.txt

# share THIS computer (shows a consent prompt for each connection)
python -m peerdesk host

# on another computer, connect to the host's address
python -m peerdesk viewer

# optional relay server (run somewhere both machines can reach)
python -m peerdesk relay --port 7421

# no arguments -> graphical launcher to pick Host or Viewer
python -m peerdesk
```

## Build the Windows installer

```powershell
powershell -ExecutionPolicy Bypass -File installer\build_windows.ps1
# -> dist\installer\PeerDesk-1.0.0-Setup.exe
```

Needs Python 3.9+ and (for the wizard) [Inno Setup 6](https://jrsoftware.org/isdl.php).
End users of the installer need nothing pre-installed. Full steps:
[`docs/05-deployment.md`](docs/05-deployment.md).

## Run the tests

```bash
cd peerdesk
python -m unittest discover -s tests -v
```

54 standard-library tests — protocol, crypto, permission model, file transfer,
config, plus end-to-end host⇄viewer and relay integration tests that run
headlessly (no display needed).

## Project layout

```
peerdesk/
├── peerdesk/            # the package
│   ├── protocol.py      # wire framing
│   ├── crypto.py        # X25519, PBKDF2, authenticated encryption
│   ├── sessions.py      # consent / permission state machine
│   ├── filetransfer.py  # chunked, verified transfers
│   ├── config.py        # persistent settings + device id
│   ├── link.py          # socket transport + transparent encryption
│   ├── capture.py       # screen capture + tile diffing
│   ├── inputctrl.py     # keyboard/mouse injection
│   ├── host.py          # host service (serve_connection, ScreenHost)
│   ├── viewer.py        # viewer client
│   ├── relay.py         # optional rendezvous relay
│   └── ui/              # Tkinter host & viewer windows
├── tests/               # unittest suite
├── installer/           # PyInstaller spec + Inno Setup wizard + build script
└── docs/                # requirements, architecture, security, test plan, deploy, user guide
```

## Documentation

| Doc | Contents |
|-----|----------|
| [`docs/01-requirements.md`](docs/01-requirements.md) | functional & non-functional requirements, acceptance criteria |
| [`docs/02-architecture.md`](docs/02-architecture.md) | components, protocol, sequence diagrams, design trade-offs |
| [`docs/03-security.md`](docs/03-security.md) | threat model, crypto, acceptable use, known limitations |
| [`docs/04-test-plan.md`](docs/04-test-plan.md) | automated coverage + manual checklist |
| [`docs/05-deployment.md`](docs/05-deployment.md) | build, package, sign, CI, release |
| [`docs/user-guide.md`](docs/user-guide.md) | end-user walkthrough |
| [`docs/06-mobile.md`](docs/06-mobile.md) | Android app requirements, architecture, limits, APK build |

## Mobile (Android)

A Flutter companion app lives in [`mobile/`](mobile/) and speaks the **same
encrypted protocol**, so a phone and a PC interoperate directly:

- **📱 → 💻 (primary):** the phone connects to and controls a PC — view,
  touch-as-mouse, on-screen keyboard, and file push.
- **💻 → 📱 (secondary):** a PC views the phone's screen via Android
  MediaProjection (view-only — Android blocks remote input injection into other
  apps).

The Dart↔Python crypto interop is verified byte-for-byte in the mobile test
suite. The installable **APK** is produced by CI
([`.github/workflows/peerdesk-android.yml`](../.github/workflows/peerdesk-android.yml))
and downloaded from the repo's **Actions → Artifacts**, because compiling an
Android APK needs Google's servers that the cloud sandbox blocks. See
[`mobile/README.md`](mobile/README.md).

## Responsible use

PeerDesk is for **authorised** remote access — your own machines, or machines
whose user has agreed to the session. Accessing a computer without the owner's
permission is illegal in most places and is not a supported use. See
[`docs/03-security.md`](docs/03-security.md).

## License

See [`LICENSE`](../LICENSE).
