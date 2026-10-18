# PeerDesk — Requirements Specification

Phase 1 of the SDLC. Defines *what* PeerDesk must do and the constraints it
operates under, independent of implementation.

## 1. Purpose & scope

PeerDesk is a remote-support tool that lets a **viewer** see, and with
permission control, a **host** computer, and transfer files between them. It is
designed for consent-based scenarios: helping a family member, remote IT
support, accessing your own second machine.

**In scope:** screen viewing, remote keyboard/mouse control, bidirectional file
transfer, clipboard text sharing, per-session consent, optional unattended
(password) access, direct and relayed connectivity, a Windows installer.

**Out of scope (v1):** audio/video of a webcam, multi-monitor spanning, session
recording, mobile clients, a hosted public relay service, an account system.

## 2. Actors

| Actor | Description |
|-------|-------------|
| Host operator | The person at the computer being shared. Grants/denies access. |
| Viewer | The person connecting to control or assist. |
| Relay | Optional unattended server that pairs two endpoints behind NAT. |

## 3. Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Each installation has a stable numeric **device address** shown to the operator. | Must |
| FR-2 | A viewer connects using an address + port, or an address via a relay. | Must |
| FR-3 | Before any screen data or input flows, the **host operator must explicitly approve** the session (consent dialog), unless unattended access is deliberately configured. | Must |
| FR-4 | The operator can approve a **subset** of requested permissions (e.g. view but not control). | Must |
| FR-5 | Granted permissions are **session-scoped** — discarded on disconnect; the next connection re-prompts. ("one-time permission") | Must |
| FR-6 | The operator can **revoke control** or **disconnect** at any time during a session. | Must |
| FR-7 | The viewer sees the host screen updated continuously. | Must |
| FR-8 | With CONTROL permission, the viewer's mouse and keyboard drive the host. | Must |
| FR-9 | With FILE_TRANSFER permission, either side can send files; integrity is verified (SHA-256). | Must |
| FR-10 | Optional **unattended password** lets a viewer connect without an operator present, proven without sending the password in clear. | Should |
| FR-11 | A **relay** server allows connection when the two machines cannot reach each other directly. | Should |
| FR-12 | Clipboard **text** can be shared when permitted. | Could |
| FR-13 | Shipped as a signed Windows installer with Start-menu/desktop shortcuts and an optional firewall rule. | Must |

## 4. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 **Security** | All session traffic (screen, input, files) is end-to-end encrypted between endpoints; a relay sees only ciphertext. |
| NFR-2 **Consent-by-default** | The safe configuration (prompt for every session, control off until granted) is the default; weakening it requires an explicit operator action. |
| NFR-3 **Transparency** | While a session is active the operator always sees who is connected and can end it. No hidden/stealth operation. |
| NFR-4 **No artificial limits** | No session time limit, connection count cap, or trial expiry in the software itself. |
| NFR-5 **Portability** | Core logic is OS-independent Python; capture/input use per-OS backends. Primary target: Windows 10/11 x64. |
| NFR-6 **Performance** | Only changed screen regions are transmitted; target ≥10 fps on a LAN at 1080p. |
| NFR-7 **Testability** | The protocol, crypto, permission and file-transfer logic run headlessly and are covered by automated tests. |
| NFR-8 **Resource safety** | Aborted/partial transfers leave no usable file; a hostile peer cannot exhaust host memory (message size cap) or escape the download directory (path sanitisation). |

## 5. Constraints & assumptions

- Python 3.9+ runtime (frozen into the Windows build, so end users need nothing
  pre-installed).
- The operator is a trusted party on the host machine; PeerDesk defends the
  operator against a malicious viewer, not the viewer against a malicious host.
- Lawful, authorised use only — see `docs/03-security.md` §Acceptable use.

## 6. Acceptance criteria (traceability to tests)

| Requirement | Verified by |
|-------------|-------------|
| FR-3, FR-4, FR-5 | `tests/test_sessions.py`, `tests/test_integration.py::test_view_only_blocks_input`, `test_rejected_session_raises` |
| FR-8 | `tests/test_integration.py::test_full_session_grants_control_and_streams` |
| FR-9, NFR-8 | `tests/test_filetransfer.py`, `tests/test_integration.py::test_file_push_to_host` |
| FR-10 | `tests/test_integration.py::test_password_auth_required`, `test_wrong_password_rejected` |
| FR-11 | `tests/test_relay.py` |
| NFR-1 | `tests/test_crypto.py`, `tests/test_integration.py::test_channel_is_encrypted` |
