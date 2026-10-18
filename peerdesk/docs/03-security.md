# PeerDesk — Security Design & Threat Model

Remote-control software is powerful and therefore sensitive. This document
states what PeerDesk protects, how, and the responsible-use boundary it is built
around.

## 1. Acceptable use

PeerDesk is for **authorised, consent-based remote access** — supporting your
own machines or machines whose user has agreed to the session. The design makes
this explicit rather than optional:

- The host operator is prompted to approve **every** session by default.
- A session is clearly visible on the host while active, and can be ended at any
  time by the operator.
- Permissions do not persist; each connection starts from zero.

PeerDesk deliberately has **no** hidden/stealth mode, no silent install of a
background agent without a visible host window, and no mechanism to suppress the
consent prompt remotely. Using remote-access software to access a computer
without the owner's authorisation is illegal in most jurisdictions; that is not
a supported use.

## 2. What is protected, and from whom

| Asset | Threat | Mitigation |
|-------|--------|-----------|
| Screen contents, keystrokes, files in transit | Passive eavesdropper / malicious relay | End-to-end encryption (X25519 → HKDF → Fernet AES-128-CBC+HMAC). The relay only ever forwards ciphertext. |
| The host machine | A viewer doing more than allowed | Every privileged action is gated on a session permission the operator granted; revocation is immediate. |
| Unattended password | Interception / offline guessing | Never sent on the wire (HMAC challenge-response); stored only locally; derived with PBKDF2-HMAC-SHA256, 200k iterations. |
| Host filesystem | Path-traversal via crafted filenames | Received names reduced to basename; writes confined to the chosen download directory. |
| Host memory | Oversized/garbled messages | Per-message size cap; strict framing/validation in `protocol.py`. |

## 3. Cryptography

- **Key agreement:** ephemeral X25519 per connection. Public keys are exchanged
  in the clear; the shared secret is run through HKDF-SHA256 to a 32-byte key.
- **Record protection:** `cryptography`'s Fernet (AES-128-CBC with HMAC-SHA256
  authentication and a timestamp). Tampered or truncated records fail to
  decrypt rather than returning garbage.
- **Password proof:** `HMAC-SHA256(PBKDF2(password, salt), nonce)` — the host
  issues a fresh salt+nonce per login attempt.
- We use only vetted primitives from the `cryptography` package; no home-grown
  ciphers.

### Known limitations (documented, not hidden)
- The X25519 exchange in v1 is **unauthenticated** — it protects against a
  passive relay but a determined active man-in-the-middle on the network path
  could substitute keys. Mitigations/roadmap: pin a host key fingerprint, or
  require the unattended password (the challenge-response binds to the derived
  key). For untrusted networks, prefer a trusted relay or a VPN/SSH tunnel until
  key-pinning lands.
- Fernet uses AES-128; adequate for session confidentiality, not a compliance
  claim.

## 4. Trust boundaries

- The **operator** is trusted on the host. PeerDesk protects the operator from
  an over-reaching viewer; it does not claim to protect a viewer from a
  malicious host.
- The **relay** is untrusted for confidentiality (sees only ciphertext) but is
  trusted for availability/pairing.
- Config and any stored password live in the per-user profile with the OS's file
  permissions.

## 5. Secure defaults

| Setting | Default | Effect |
|---------|---------|--------|
| `require_consent` | on | prompt for every session |
| `allow_control` | on but **ungranted** until the operator approves it per session | |
| `auto_accept` | off | never auto-approve |
| `unattended_password` | empty | password login disabled unless set |
| `encrypt_sessions` | on | E2E encryption |

## 6. Operational guidance

- Only share your address/password with someone you trust, for a session you
  expect.
- Watch the session banner; click Disconnect when finished.
- Set an unattended password only if you truly need unattended access, and make
  it long/random (the UI can generate one via `crypto.generate_password`).
- Keep the firewall rule scoped to the LAN where possible.

## 7. Reporting

Security issues should be reported privately to the maintainers before public
disclosure. Include version, platform, and reproduction steps.
