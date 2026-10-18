# PeerDesk — Architecture & Design

Phase 2 of the SDLC. Describes *how* the requirements are met.

## 1. Component overview

```
                         ┌───────────────────────────┐
     Host machine        │          PeerDesk          │       Viewer machine
                         └───────────────────────────┘
  ┌───────────────┐                                        ┌───────────────┐
  │  ui/host_app  │  consent dialog, active sessions       │ ui/viewer_app │
  └──────┬────────┘                                        └──────┬────────┘
         │                                                        │
  ┌──────▼────────┐        encrypted PeerDesk protocol    ┌──────▼────────┐
  │    host.py    │◀──────────────────────────────────────▶│   viewer.py   │
  │ serve_connection│       (link.py over TCP / relay)     │  ViewerClient │
  └──┬────┬────┬───┘                                       └───────────────┘
     │    │    │
 capture inputctrl filetransfer      sessions.py (permission state machine)
   .py     .py      .py              crypto.py  (X25519, PBKDF2, Fernet)
                                     protocol.py (wire framing)
                                     config.py   (persistent settings + id)
                                     relay.py    (optional rendezvous)
```

### Layer separation
- **Core (headless, pure):** `protocol`, `crypto`, `sessions`, `filetransfer`,
  `config`. No sockets, no display. Fully unit-tested.
- **Transport:** `link` (socket + transparent encryption), `relay`.
- **Runtime (OS-dependent):** `capture` (mss/Pillow), `inputctrl` (pynput).
- **UI:** `ui/host_app`, `ui/viewer_app` (Tkinter).

This split is deliberate: all the security-critical decision logic lives in the
pure core, so it can be reasoned about and tested without a GUI or a second
machine.

## 2. Wire protocol

Every message is:

```
MAGIC(4) VERSION(1) FLAGS(1) JSON_LEN(4) BIN_LEN(4) | JSON | BINARY
```

- The JSON part always has a `kind` plus metadata.
- The binary part carries bulk data (a JPEG screen tile, a file chunk, or an
  encryption envelope) without base64 overhead.
- `FLAG_ENCRYPTED` marks a message whose binary part is a sealed envelope of the
  real inner message; `link.Link` adds/strips this transparently.
- A per-message size cap (`DEFAULT_MAX_MESSAGE`) prevents memory-exhaustion from
  a hostile peer.

See `peerdesk/protocol.py` for the message-kind catalogue.

## 3. Connection & consent sequence

```
Viewer                             Host
  │ ── HELLO (name, pubkey) ───────▶│
  │ ◀─ SERVER_HELLO (pubkey, auth?) │   both derive X25519 shared key
  │        … channel now encrypted …│
  │ ── AUTH_RESPONSE ──────────────▶│   (only if a password is set)
  │ ◀─ AUTH_RESULT ─────────────────│
  │ ── SESSION_REQUEST(perms) ─────▶│
  │ ◀─ CONSENT_PENDING ─────────────│   ░ operator sees the consent dialog ░
  │ ◀─ SESSION_GRANTED(perms,screen)│   (or SESSION_REJECTED)
  │ ◀═ FRAME, FRAME, … ═════════════│   screen tiles stream out
  │ ── INPUT / FILE_* ─────────────▶│   gated per-permission on the host
  │ ◀─ SESSION_CLOSED ──────────────│   grants discarded here (one-time)
```

The key exchange happens in cleartext (only public keys cross the wire); every
message after it is encrypted. Password auth, when enabled, is a
challenge-response so the password itself never transits.

## 4. Screen streaming design

`capture.TileEncoder` cuts each captured frame into a grid of tiles (default
128×128), hashes each tile, and emits only the tiles whose hash changed since
the previous frame. The first frame (or any resolution change) emits all tiles.
Each tile is JPEG-encoded. This keeps bandwidth proportional to on-screen motion
without a full video codec — the classic trade-off of simplicity and zero extra
native dependencies over raw compression ratio.

`host._Pump` runs this on a background thread at a target FPS and writes tiles to
the link; the viewer composites tiles onto a framebuffer image and blits it to a
Tk canvas, scaling to the window.

## 5. Remote input design

Input events are resolution-independent: coordinates are normalised to 0..1 by
the viewer and scaled to the host's screen by `inputctrl.SystemInputController`.
The host applies an event **only** if `session.allows(CONTROL)` is true at that
moment, so a mid-session revoke takes effect immediately.

## 6. File transfer design

Three phases — `FILE_PUT_BEGIN` (name/size/sha256), a stream of `FILE_CHUNK`s,
`FILE_PUT_END`. The receiver streams to a `.part` temp file, verifies size and
SHA-256, and only then atomically renames into place. Names are reduced to a
basename to prevent directory traversal; collisions are de-duplicated
(`file (1).txt`). Transfers are gated on `FILE_TRANSFER` permission.

## 7. Concurrency model

- **Host:** one accept loop thread; one thread per connection running
  `serve_connection`; within a connection, a `_Pump` thread for the screen and
  the connection thread for inbound messages. `Link` serialises sends with a
  lock.
- **Viewer UI:** Tk main loop thread renders; a background thread runs the
  receive loop and hands frames to the UI via a queue drained by `root.after`.
- Cross-thread UI calls always marshal through a queue + `after`, never touch Tk
  from a worker thread directly.

## 8. Design decisions / trade-offs

| Decision | Rationale |
|----------|-----------|
| Python + Tkinter | Zero external UI deps, trivial to freeze, cross-platform core. |
| JPEG tile diff instead of H.264 | No native codec dependency; good enough on LAN; easy to test. |
| X25519 per connection | Forward-ish secrecy and E2E encryption even without a password, so a relay never sees plaintext. |
| Permission state in pure `sessions.py` | Security logic is testable and independent of UI/transport. |
| One-folder PyInstaller + Inno Setup | Standard, well-understood Windows packaging; easy firewall/shortcut integration. |

## 9. Extension points

- Swap `TileEncoder` for a codec-backed encoder behind the same
  `screen_size()/next_tiles()` interface.
- Add TURN-style auth to `relay.py` for a public deployment.
- Add a `Permission.AUDIO` producer/consumer (reserved in the enum already).
