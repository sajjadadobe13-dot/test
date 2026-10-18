# PeerDesk — Mobile (Android) Addendum

Extends the SDLC docs to the Android companion app in `peerdesk/mobile/`.
It reuses the same protocol, crypto and consent model as the desktop app, so
the earlier requirements/architecture/security docs apply; this page records
what is mobile-specific.

## Requirements delta

| ID | Requirement | Status |
|----|-------------|--------|
| M-1 | Android app connects to a PC host and shows its screen (**📱→💻**, priority 1). | Done |
| M-2 | With consent, the phone controls the PC via touch-as-mouse + on-screen keyboard. | Done |
| M-3 | Phone can push files to the PC. | Done |
| M-4 | A PC can view the phone's screen (**💻→📱**, priority 2). | Done (view) |
| M-5 | PC controls the phone's input. | **Not possible** on stock Android (see below). |
| M-6 | Same E2E encryption + consent as desktop; interoperable on the wire. | Done, interop-tested |
| M-7 | Delivered as source + an installable APK. | Source in-repo; APK via CI |

## Architecture notes

- **Pure-Dart core** (`lib/core/`) is a faithful port of the Python
  `protocol.py`, `crypto.py`, `sessions.py`, `link.py`, so the two
  implementations share one wire format.
- **Viewer** (`lib/viewer/`) renders the remote screen by drawing JPEG tiles on
  a `CustomPaint` canvas and maps touch gestures to normalized mouse events.
- **Host** (`lib/host/`) ports the server half of `host.py` to Dart and pulls
  frames from a MediaProjection bridge (`screen_capture.dart` ↔
  `MainActivity.kt`/`ScreenCaptureService.kt`).
- **Native Kotlin** is confined to screen capture: a foreground service holds
  the `MediaProjection`, mirrors the display into an `ImageReader`, JPEG-encodes
  frames, and forwards them over an `EventChannel`.

## The PC→phone control limitation (M-5)

Injecting input into other apps on Android requires an `AccessibilityService`
(restricted, with a scary user warning and Play policy constraints) or root.
PeerDesk therefore makes host mode **VIEW + FILE_TRANSFER only**: the Android
`HostConfig.filterRequested` strips `CONTROL` before consent, so it can never be
granted, and inbound input messages are ignored. Mobile→PC control is
unaffected because desktop OSes permit synthetic input (via `pynput`).

## Verification

Automated (runs headless, no device needed — `flutter test`):
- `protocol_test.dart` — framing round-trips.
- `crypto_interop_test.dart` — **cross-implementation** vectors: the Dart app
  decrypts a token the Python host produced, derives the identical session key,
  and matches PBKDF2 + challenge-response. Bidirectional Fernet was also
  confirmed (Python decrypts a Dart token) during development.
- `host_loopback_test.dart` — Dart host ⟷ Dart viewer over a socket: handshake,
  consent, control-filtering, a frame, a file push, password auth both ways.

Manual (needs a phone + a PC on one LAN): install the APK, run the PC host,
connect from the phone, verify consent prompt, screen, tap/drag/keyboard, file
push; then reverse with "Share this phone" and verify view-only on the PC.

## Build & deployment (APK)

The Android SDK + Google Maven (`dl.google.com`) are required to compile an
APK and are **blocked in the cloud dev sandbox**, so the APK is built in CI:
`.github/workflows/peerdesk-android.yml` runs `flutter analyze`, `flutter test`,
then `flutter build apk --release` (universal + per-ABI) and uploads the APKs as
the `peerdesk-apk` artifact. Locally, `flutter build apk --release` produces the
same output wherever those hosts are reachable. Release signing for store
distribution is wired per Flutter's keystore guide.
