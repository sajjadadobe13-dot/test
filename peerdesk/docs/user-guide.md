# PeerDesk — User Guide

A friendly walkthrough for everyday use.

## Install

1. Run `PeerDesk-1.0.0-Setup.exe` and follow the wizard.
2. On the options page you can tick:
   - **Desktop shortcut**
   - **Allow PeerDesk through the firewall** (needed to receive connections)
   - **Start the host at sign-in** (for a machine you want always reachable)
3. Finish. You can launch PeerDesk from the Start menu.

Nothing else is required — Python and all libraries are bundled.

## The two roles

PeerDesk does two jobs; the launcher lets you pick:

- **Share This Computer (Host)** — let someone else see/help with *this* PC.
- **Connect to a Computer (Viewer)** — see/help with *another* PC.

## Letting someone connect to you (Host)

1. Open PeerDesk → **Share This Computer**.
2. Note **Your Address** (a 9-digit number) at the top.
3. Click **Start Sharing**. Status turns to *Listening*.
4. Tell the other person your address (and your IP or relay, see below).
5. When they connect, a **Connection Request** window pops up showing who they
   are and what they want to do (view, control, files, clipboard).
6. Untick anything you don't want to allow, then **Accept** (or **Reject**).
7. While connected, the person appears under **Active Sessions**. You can:
   - toggle **control** off to make it view-only on the fly, or
   - click **Disconnect** to end it instantly.

Every new connection asks again — permission is never remembered.

### Unattended access (optional)
If you want to reach this PC later with nobody sitting at it, set an
**Unattended password** in the Security box before starting. Anyone who knows
the address *and* password can then connect without the pop-up. Use a long,
random password and only if you really need this.

## Connecting to another computer (Viewer)

1. Open PeerDesk → **Connect to a Computer**.
2. Enter the host's **address** and **port** (default 7420). On a LAN the
   address is the host PC's IP; across the internet use a relay (below).
3. If the host set an unattended password, type it; otherwise leave it blank.
4. Tick which permissions to **request** (control, files, clipboard).
5. Click **Connect**. You'll see *Waiting for the remote user to accept…*
6. Once they accept, their screen appears. If you have control, just use your
   mouse and keyboard over the window. Use **Send File…** to transfer a file.
7. Click **Disconnect** when done.

## Connecting across the internet (Relay)

If the two PCs aren't on the same network, run a relay on a server both can
reach:

```
peerdesk relay --port 7421
```

Then, in **Settings** on both PCs, set the relay host and port, and on the
viewer tick **Connect through relay server** and enter the host's 9-digit
address instead of an IP. The relay only passes along encrypted data — it can't
see your screen or files.

## File transfer

With file permission granted, the viewer's **Send File…** button pushes a file
to the host's `Downloads\PeerDesk` folder. Files are checksum-verified, so a
corrupted transfer is detected and discarded rather than saved.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Viewer can't connect on a LAN | Ensure the host clicked *Start Sharing*, the firewall task was ticked at install (or add port 7420), and you used the host's current IP. |
| "declined" | The host operator clicked Reject, or the request timed out. Ask them to accept. |
| "Incorrect password" | The unattended password didn't match. |
| Black screen / no update | The host may be on a secure desktop (UAC prompt) that capture can't read; dismiss it on the host. |
| Across the internet doesn't work | Direct connections need port forwarding; use a relay instead. |

## Ending & privacy

Closing the host window or clicking Disconnect ends the session immediately and
drops all granted permissions. There is no background access after a session
ends unless you configured an unattended password and left the host running.
