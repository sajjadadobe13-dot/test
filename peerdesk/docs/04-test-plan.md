# PeerDesk — Test Plan

Phase 4 of the SDLC. How PeerDesk is verified, and how to run the checks.

## 1. Strategy

Because the security-critical logic lives in a pure, headless core, the bulk of
testing is fast automated unit + integration tests that run with **no display
and no second machine** — on a developer box or in CI. Screen/input/GUI paths
that genuinely need a desktop are covered by a documented manual checklist.

The test suite uses only the standard-library `unittest`, so it needs nothing
beyond the runtime dependencies:

```bash
python -m unittest discover -s tests -v
```

## 2. Automated coverage

| Area | File | What it proves |
|------|------|----------------|
| Wire protocol | `test_protocol.py` | round-trip encode/decode, partial-byte streaming, multi-message buffers, bad-magic & oversize rejection, flag preservation |
| Cryptography | `test_crypto.py` | device-id shape/uniqueness, PBKDF2 determinism, correct/incorrect password challenge-response, authenticated-encryption round-trip, tamper & wrong-key rejection |
| Permission model | `test_sessions.py` | nothing granted before consent, subset grants, never exceed request, mid-session revoke, one-time close drops all grants, host policy filtering |
| File transfer | `test_filetransfer.py` | byte-exact round-trip, empty file, checksum-mismatch detection, out-of-order rejection, path-traversal sanitisation, no-clobber de-dupe |
| Config | `test_config.py` | first-run id creation, id stability, persistence, corrupt-file fallback, unknown-key tolerance |
| End-to-end (host⇄viewer) | `test_integration.py` | full encrypted handshake, control granted + input applied, view-only blocks input, rejection path, file push, password auth success/failure, channel encrypted |
| Relay | `test_relay.py` | a complete session negotiated through the rendezvous relay |

Current status: **54 automated tests, all passing.** The integration and relay
tests run the *real* `host.serve_connection` and `ViewerClient` over an OS socket
pair / loopback, with a static frame source and a recording input sink standing
in for the display and keyboard.

## 3. Running

```bash
# all tests
python -m unittest discover -s tests -v

# a single module
python -m unittest tests.test_integration -v

# quiet summary
python -m unittest discover -s tests
```

CI runs the same command on Windows and Linux (see
`docs/05-deployment.md` for the CI outline).

## 4. Manual test checklist (desktop required)

Perform on two Windows machines (or two VMs) on the same LAN.

1. **Discovery & start** — install, launch, confirm a 9-digit address shows; Start Sharing → status "Listening".
2. **Consent prompt** — from the viewer, connect to the address; confirm the host shows the consent dialog with the requesting identity and the exact permissions requested.
3. **Reject path** — click Reject; viewer shows "declined"; no screen appears.
4. **Approve + view** — reconnect, Accept; viewer shows the live host screen; moving a window on the host updates on the viewer.
5. **Control** — move the viewer's mouse over the canvas and type; confirm the host cursor/keys respond; latency acceptable on LAN.
6. **View-only** — reconnect, uncheck "control" in the consent dialog; confirm the viewer can see but not move the host.
7. **Mid-session revoke** — during a controlled session, toggle control off in the host's Active Sessions row; confirm input stops immediately.
8. **Disconnect** — click Disconnect on the host; confirm the viewer returns to the connect screen.
9. **File push** — with file permission, Send File from the viewer; confirm it lands in the host's PeerDesk downloads with identical contents.
10. **Password/unattended** — set an unattended password on the host; connect from the viewer supplying it; confirm success, and failure with a wrong password.
11. **Relay** — run `peerdesk relay` on a reachable server, set the relay in both configs, connect by address through the relay.
12. **Re-prompt (one-time)** — disconnect and reconnect; confirm a fresh consent prompt appears (no remembered grant).

## 5. Non-functional checks

- **Bandwidth/motion** — a static screen should produce near-zero traffic after
  the first frame (tile diffing); confirm with a network monitor.
- **Resource safety** — abort a file transfer midway; confirm only a `.part`
  file (or nothing) remains, never a truncated final file.
- **Encryption** — capture traffic with Wireshark; confirm no plaintext screen
  or keystroke data after the handshake.

## 6. Exit criteria

- All automated tests green on target platforms.
- Manual checklist 1–12 pass on Windows 10 and 11.
- No plaintext session payload observable on the wire.
