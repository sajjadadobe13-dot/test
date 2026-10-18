# PeerDesk Mobile (Android)

The Android companion to the PeerDesk desktop app. It speaks the **same
encrypted protocol** as the PC host/viewer, so a phone and a PC interoperate
directly.

Two directions, in the priority you asked for:

1. **📱 → 💻 Mobile controls a PC (primary).** The phone is the *viewer*:
   connect to a PC running PeerDesk, watch its screen, and — if the PC operator
   approves — control it with touch (as mouse) and an on-screen keyboard, and
   push files to it. Fully implemented.
2. **💻 → 📱 PC views this phone (secondary).** The phone is the *host*: a PC
   viewer can watch the phone's screen (via Android MediaProjection) and
   exchange files. **View-only** — see the Android limitation below.

Built with **Flutter** (Dart) + a small Kotlin layer for screen capture.

---

## Get the APK

The APK is produced by continuous integration, because building an Android APK
needs the Android SDK and Google's Maven servers (`dl.google.com`), which the
cloud dev sandbox blocks. The GitHub Actions workflow
[`.github/workflows/peerdesk-android.yml`](../../.github/workflows/peerdesk-android.yml)
runs the tests and builds the APK on every push that touches `peerdesk/mobile/`.

**To download it:** open the repo's **Actions** tab → the latest **"PeerDesk
Android APK"** run → **Artifacts** → `peerdesk-apk` (contains the universal
`app-release.apk` plus smaller per-ABI APKs). You can also trigger it manually
via **Run workflow** (workflow_dispatch).

The release APK is debug-signed, so it installs directly (enable "Install
unknown apps" on the phone). For Play Store distribution, add a real keystore
(see below).

## Build it yourself (where Google's servers are reachable)

```bash
cd peerdesk/mobile
flutter pub get
flutter test            # 16 tests incl. Dart↔Python crypto interop
flutter build apk --release
# -> build/app/outputs/flutter-apk/app-release.apk
```

Requires the Flutter SDK (3.47+) and the Android SDK. For a signed release,
create `android/key.properties` + a keystore and wire it into
`android/app/build.gradle.kts` (see the Flutter
[signing guide](https://flutter.dev/to/reference-keystore)).

## Using it

**Control a PC (📱 → 💻):**
1. On the PC: run PeerDesk, **Start Sharing**, note its address and LAN IP.
2. On the phone: **Control a PC**, enter the PC's IP + port (7420) and password
   (only if the PC set one), choose which rights to request, **Connect**.
3. The PC operator accepts your request. The PC screen appears.
   - **Tap** = left click · **long-press** = right click · **drag** (toggle
     "Drag") = move/drag · scroll buttons · the keyboard button types text and
     sends special keys.
   - **Send file** uploads a file to the PC's PeerDesk downloads.

**Share this phone (💻 → 📱):**
1. On the phone: **Share this phone** → **Start sharing** → grant the Android
   screen-capture prompt. The screen shows the phone's IP + port.
2. On the PC: open the PeerDesk **Viewer**, enter that IP + port, connect.
3. The phone shows a consent dialog; accept. The PC now sees the phone's screen.

## Android limitation (why PC→phone is view-only)

Android does not let an ordinary app inject touches/keystrokes into *other*
apps — that needs an `AccessibilityService` (heavily restricted) or root. So in
host mode PeerDesk offers **VIEW + FILE_TRANSFER only**; `CONTROL` is never
granted and any input the PC sends is ignored. This is an OS policy, not a
PeerDesk shortcoming. (Mobile→PC control is unaffected — desktop OSes allow it.)

## Security

Identical guarantees to the desktop app: an ephemeral **X25519** key exchange
derives a per-session key (HKDF-SHA256), and every record is sealed with
**Fernet** (AES-128-CBC + HMAC-SHA256). Optional password login uses a PBKDF2
HMAC **challenge-response** — the password never crosses the wire. The crypto is
verified **byte-for-byte against the Python host** in
`test/crypto_interop_test.dart`.

Consent is first-class on both sides: nothing streams until the party being
viewed accepts, and approval is per session.

## Architecture

```
lib/
├── core/
│   ├── protocol.dart   # PDSK wire framing (port of protocol.py)
│   ├── crypto.dart     # X25519 + HKDF + Fernet + PBKDF2 (interop-tested)
│   ├── link.dart       # async socket transport + transparent encryption
│   └── sessions.dart   # Permission vocabulary
├── viewer/
│   ├── viewer_client.dart   # client protocol (connect/negotiate/input/files)
│   └── viewer_screen.dart   # renders remote screen; touch→mouse; keyboard
├── host/
│   ├── host_service.dart    # server protocol (consent, frames, files)
│   ├── screen_capture.dart  # MediaProjection bridge (Dart side)
│   └── host_screen.dart     # share-this-phone UI + consent dialog
└── main.dart                # app shell + home (role chooser)

android/app/src/main/kotlin/.../  # MainActivity + ScreenCaptureService (Kotlin)
test/                             # protocol, crypto-interop, host-loopback tests
```

## Tests

```bash
flutter test
```

- `protocol_test.dart` — wire framing round-trips.
- `crypto_interop_test.dart` — decrypts a **Python-generated** Fernet token,
  derives the identical X25519+HKDF key, matches PBKDF2 and the login
  challenge. Proves the phone talks the PC host's exact crypto.
- `host_loopback_test.dart` — runs the Dart **host** against the Dart **viewer**
  over a real socket: encrypted handshake, consent, Android control-filtering,
  a screen frame, and a file push.
