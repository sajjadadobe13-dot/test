/// Host-side networking for PC→Mobile sharing (Dart port of the server half of
/// peerdesk/host.py), letting a PC view this phone's screen.
///
/// IMPORTANT Android limitation: a remote peer cannot drive this phone's
/// keyboard/mouse. Injecting input into other apps requires an
/// AccessibilityService (or root), which is outside what a normal app may do.
/// So host mode is VIEW + FILE_TRANSFER only; CONTROL is never offered, and any
/// input message that arrives is logged and ignored.
library;

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import '../core/crypto.dart' as pdcrypto;
import '../core/link.dart';
import '../core/protocol.dart';
import '../core/sessions.dart';

class HostTile {
  final int x, y, w, h;
  final Uint8List data; // JPEG bytes
  HostTile(this.x, this.y, this.w, this.h, this.data);
  Map<String, dynamic> meta(int seq) =>
      {'x': x, 'y': y, 'w': w, 'h': h, 'seq': seq};
}

abstract class FrameSource {
  (int, int) screenSize();
  Future<List<HostTile>> nextTiles();
  void dispose() {}
}

/// Deterministic frame source for tests/demos (no real screen capture).
class StaticHostFrameSource implements FrameSource {
  final int width, height;
  final Uint8List payload;
  bool _emitted = false;
  StaticHostFrameSource(
      {this.width = 320, this.height = 240, Uint8List? payload})
      : payload = payload ?? Uint8List.fromList(List<int>.filled(64, 7));

  @override
  (int, int) screenSize() => (width, height);

  @override
  Future<List<HostTile>> nextTiles() async {
    if (_emitted) return [];
    _emitted = true;
    return [HostTile(0, 0, width, height, payload)];
  }

  @override
  void dispose() {}
}

class PeerInfo {
  final String name;
  final String deviceId;
  final String address;
  PeerInfo(this.name, this.deviceId, this.address);
  String label() {
    var who = name.isEmpty ? 'Unknown' : name;
    if (deviceId.isNotEmpty) who += ' ($deviceId)';
    if (address.isNotEmpty) who += ' @ $address';
    return who;
  }
}

typedef HostConsent = Future<Set<Permission>?> Function(PeerInfo peer,
    Set<Permission> requested);
typedef LogFn = void Function(String message);

class HostConfig {
  final String deviceId;
  final String deviceName;
  final String unattendedPassword;
  final bool allowFileTransfer;
  final String downloadDir;
  final int targetFps;
  final FrameSource Function() frameSourceFactory;
  final HostConsent consent;
  final LogFn log;

  HostConfig({
    required this.deviceId,
    required this.deviceName,
    required this.frameSourceFactory,
    required this.consent,
    this.unattendedPassword = '',
    this.allowFileTransfer = true,
    this.downloadDir = '.',
    this.targetFps = 8,
    this.log = _noop,
  });

  static void _noop(String _) {}

  // Android host never offers CONTROL (cannot inject input), only VIEW + files.
  Set<Permission> filterRequested(Set<Permission> requested) {
    final allowed = <Permission>{Permission.view};
    if (allowFileTransfer) allowed.add(Permission.fileTransfer);
    return requested.intersection(allowed)..add(Permission.view);
  }
}

/// Serves a single connection to completion.
Future<void> serveConnection(Link link, HostConfig cfg,
    {String peerAddress = ''}) async {
  FrameSource? frames;
  Timer? pump;
  IOSink? recvSink;
  File? recvTmp;
  int recvExpected = 0;
  var active = false;

  Future<void> cleanup() async {
    pump?.cancel();
    frames?.dispose();
    try {
      await recvSink?.close();
    } catch (_) {}
    try {
      await link.send(kSessionClosed);
    } catch (_) {}
    await link.close();
  }

  try {
    final hello = await link.recv(timeout: const Duration(seconds: 30));
    if (hello.kind != kHello) {
      await link.send(kError, meta: {'message': 'expected hello'});
      return;
    }
    final peer = PeerInfo(
      hello.get<String>('name') ?? 'Unknown',
      hello.get<String>('device_id') ?? '',
      peerAddress,
    );
    final kx = await pdcrypto.generateKeyExchange();
    final authRequired = cfg.unattendedPassword.isNotEmpty;
    await link.send(kServerHello, meta: {
      'name': cfg.deviceName,
      'device_id': cfg.deviceId,
      'protocol': kProtocolVersion,
      'auth_required': authRequired,
      'pubkey': pdcrypto.b64e(kx.publicBytes),
    });
    final viewerPub = hello.get<String>('pubkey');
    if (viewerPub != null && viewerPub.isNotEmpty) {
      final shared =
          await pdcrypto.deriveSharedKey(kx.keyPair, pdcrypto.b64d(viewerPub));
      link.enableEncryption(pdcrypto.SecureChannel(shared));
      cfg.log('encrypted channel established with ${peer.label()}');
    }

    if (authRequired) {
      if (!await _authenticate(link, cfg)) {
        cfg.log('authentication failed for ${peer.label()}');
        return;
      }
    }

    final req = await link.recv(timeout: const Duration(seconds: 60));
    if (req.kind != kSessionRequest) {
      await link.send(kError, meta: {'message': 'expected session_request'});
      return;
    }
    final requested = cfg.filterRequested(
        Permission.fromWireList((req.meta['permissions'] as List?) ?? const []));
    await link.send(kConsentPending,
        meta: {'message': 'waiting for operator approval'});
    cfg.log('${peer.label()} requests ${Permission.toWireList(requested)}');

    final granted = await cfg.consent(peer, requested);
    if (granted == null || granted.isEmpty) {
      await link.send(kSessionRejected, meta: {'reason': 'declined'});
      cfg.log('session with ${peer.label()} declined');
      return;
    }
    final effective = granted.intersection(requested)..add(Permission.view);
    active = true;
    frames = cfg.frameSourceFactory();
    final (w, h) = frames.screenSize();
    await link.send(kSessionGranted, meta: {
      'session_id': pdcrypto.b64e(pdcrypto.randomBytes(16)),
      'granted': Permission.toWireList(effective),
      'screen': {'width': w, 'height': h},
    });
    cfg.log('session approved: ${Permission.toWireList(effective)}');

    // frame pump
    var seq = 0;
    final interval = Duration(milliseconds: (1000 / cfg.targetFps).round());
    pump = Timer.periodic(interval, (_) async {
      if (!active) return;
      try {
        final tiles = await frames!.nextTiles();
        for (final t in tiles) {
          await link.send(kFrame, meta: t.meta(++seq), blob: t.data);
        }
      } catch (e) {
        cfg.log('capture error: $e');
      }
    });

    // inbound loop
    while (active) {
      Message msg;
      try {
        msg = await link.recv();
      } catch (_) {
        break;
      }
      switch (msg.kind) {
        case kInput:
          // Android: cannot inject input into other apps. Logged + ignored.
          break;
        case kFilePutBegin:
          if (effective.contains(Permission.fileTransfer)) {
            final name = _safeName(msg.get<String>('name') ?? 'file');
            recvTmp = File('${cfg.downloadDir}/$name.part');
            recvSink = recvTmp.openWrite();
            recvExpected = (msg.meta['size'] as num?)?.toInt() ?? 0;
          }
          break;
        case kFileChunk:
          recvSink?.add(msg.blob);
          break;
        case kFilePutEnd:
          if (recvSink != null && recvTmp != null) {
            await recvSink.close();
            recvSink = null;
            final name = recvTmp.path.replaceAll('.part', '');
            await recvTmp.rename(name);
            recvTmp = null;
            await link.send(kFileProgress, meta: {'done': true, 'path': name});
            cfg.log('file saved: $name ($recvExpected bytes)');
          }
          break;
        case kPing:
          await link.send(kPong, meta: {'t': msg.meta['t']});
          break;
        case kSessionClosed:
          active = false;
          break;
      }
    }
  } on LinkClosed catch (e) {
    cfg.log('connection ended: ${e.message}');
  } catch (e) {
    cfg.log('connection error: $e');
  } finally {
    active = false;
    await cleanup();
  }
}

Future<bool> _authenticate(Link link, HostConfig cfg) async {
  final salt = pdcrypto.randomBytes(16);
  final nonce = pdcrypto.randomBytes(32);
  await link.send(kAuthChallenge,
      meta: {'salt': pdcrypto.b64e(salt), 'nonce': pdcrypto.b64e(nonce)});
  final resp = await link.recv(timeout: const Duration(seconds: 30));
  if (resp.kind != kAuthResponse) {
    await link.send(kAuthResult, meta: {'ok': false});
    return false;
  }
  final key = await pdcrypto.deriveKeyPbkdf2(cfg.unattendedPassword, salt);
  final expected = await pdcrypto.challengeAnswer(key, nonce);
  final answer = pdcrypto.b64d(resp.get<String>('answer') ?? '');
  final ok = pdcrypto.constantTimeEquals(expected, answer);
  await link.send(kAuthResult, meta: {'ok': ok});
  return ok;
}

String _safeName(String name) {
  final base = name.replaceAll('\\', '/').split('/').last.trim();
  if (base.isEmpty || base == '.' || base == '..') return 'received_file';
  return base;
}

/// Binds a server socket and serves each inbound viewer on its own future.
class ScreenShareHost {
  final HostConfig cfg;
  final String host;
  final int port;
  ServerSocket? _server;

  ScreenShareHost(this.cfg, {this.host = '0.0.0.0', this.port = 7420});

  Future<void> start() async {
    _server = await ServerSocket.bind(host, port, shared: true);
    cfg.log('PeerDesk host listening on $host:$port (id ${cfg.deviceId})');
    _server!.listen((socket) {
      final addr = '${socket.remoteAddress.address}:${socket.remotePort}';
      cfg.log('incoming connection from $addr');
      serveConnection(Link(socket), cfg, peerAddress: addr);
    });
  }

  Future<void> stop() async {
    await _server?.close();
    _server = null;
    cfg.log('PeerDesk host stopped');
  }
}
