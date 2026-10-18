/// Viewer-side protocol client (Dart port of peerdesk/viewer.py).
///
/// Connects to a PeerDesk PC host, performs the X25519 key exchange, optional
/// password login, and the consent negotiation, then exposes a simple API the
/// UI uses: receive screen frames, send input, transfer files.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import '../core/crypto.dart' as pdcrypto;
import '../core/link.dart';
import '../core/protocol.dart';
import '../core/sessions.dart';

class SessionRejected implements Exception {
  final String reason;
  SessionRejected(this.reason);
  @override
  String toString() => 'SessionRejected: $reason';
}

class AuthFailed implements Exception {
  @override
  String toString() => 'AuthFailed: incorrect password';
}

class NegotiationResult {
  final String sessionId;
  final Set<Permission> granted;
  final int screenWidth;
  final int screenHeight;
  final String hostName;
  final String hostId;
  NegotiationResult({
    required this.sessionId,
    required this.granted,
    required this.screenWidth,
    required this.screenHeight,
    required this.hostName,
    required this.hostId,
  });
}

class ViewerClient {
  final String name;
  final String deviceId;
  Link? _link;
  pdcrypto.KeyExchange? _kx;
  NegotiationResult? result;

  ViewerClient({this.name = 'PeerDesk Mobile', this.deviceId = ''});

  Link get link {
    final l = _link;
    if (l == null) throw StateError('not connected');
    return l;
  }

  Future<void> connect(String host, int port,
      {Duration timeout = const Duration(seconds: 15)}) async {
    _link = await Link.connect(host, port, timeout: timeout);
  }

  void attachLink(Link l) => _link = l;

  Future<NegotiationResult> negotiate(Set<Permission> requested,
      {String password = ''}) async {
    _kx = await pdcrypto.generateKeyExchange();
    await link.send(kHello, meta: {
      'name': name,
      'device_id': deviceId,
      'protocol': kProtocolVersion,
      'pubkey': pdcrypto.b64e(_kx!.publicBytes),
    });

    final serverHello = await link.recv(timeout: const Duration(seconds: 30));
    if (serverHello.kind != kServerHello) {
      throw ProtocolError('expected server_hello, got ${serverHello.kind}');
    }
    final hostPub = serverHello.get<String>('pubkey');
    if (hostPub != null && hostPub.isNotEmpty) {
      final shared =
          await pdcrypto.deriveSharedKey(_kx!.keyPair, pdcrypto.b64d(hostPub));
      link.enableEncryption(pdcrypto.SecureChannel(shared));
    }

    if (serverHello.get<bool>('auth_required') == true) {
      await _authenticate(password);
    }

    await link.send(kSessionRequest,
        meta: {'permissions': Permission.toWireList(requested)});

    while (true) {
      final msg = await link.recv(timeout: const Duration(seconds: 600));
      switch (msg.kind) {
        case kConsentPending:
          continue;
        case kSessionRejected:
          throw SessionRejected(msg.get<String>('reason') ?? 'declined');
        case kSessionGranted:
          final screen =
              (msg.meta['screen'] as Map?)?.cast<String, dynamic>() ?? {};
          result = NegotiationResult(
            sessionId: msg.get<String>('session_id') ?? '',
            granted: Permission.fromWireList(
                (msg.meta['granted'] as List?) ?? const []),
            screenWidth: (screen['width'] as num?)?.toInt() ?? 0,
            screenHeight: (screen['height'] as num?)?.toInt() ?? 0,
            hostName: serverHello.get<String>('name') ?? '',
            hostId: serverHello.get<String>('device_id') ?? '',
          );
          return result!;
        default:
          throw ProtocolError('unexpected message during negotiation: ${msg.kind}');
      }
    }
  }

  Future<void> _authenticate(String password) async {
    final challenge = await link.recv(timeout: const Duration(seconds: 30));
    if (challenge.kind != kAuthChallenge) {
      throw ProtocolError('expected auth_challenge');
    }
    final salt = pdcrypto.b64d(challenge.get<String>('salt') ?? '');
    final nonce = pdcrypto.b64d(challenge.get<String>('nonce') ?? '');
    final key = await pdcrypto.deriveKeyPbkdf2(password, salt);
    final answer = await pdcrypto.challengeAnswer(key, nonce);
    await link.send(kAuthResponse, meta: {'answer': pdcrypto.b64e(answer)});
    final res = await link.recv(timeout: const Duration(seconds: 30));
    if (res.kind != kAuthResult || res.get<bool>('ok') != true) {
      throw AuthFailed();
    }
  }

  Future<Message> recv({Duration? timeout}) => link.recv(timeout: timeout);

  Future<void> sendInput(Map<String, dynamic> event) =>
      link.send(kInput, meta: event);

  Future<void> sendClipboard(String text) =>
      link.send(kClipboard, meta: {'text': text});

  Future<void> requestFileList([String path = '']) =>
      link.send(kFileListReq, meta: {'path': path});

  Future<void> ping() => link.send(kPing, meta: {'t': 0});

  /// Push a local file to the PC host's download directory.
  Future<void> sendFile(String path,
      {void Function(int sent, int total)? onProgress}) async {
    final file = File(path);
    final bytes = await file.readAsBytes();
    final digest = await Sha256().hash(bytes);
    final hex = digest.bytes
        .map((b) => b.toRadixString(16).padLeft(2, '0'))
        .join();
    final name = path.split(Platform.pathSeparator).last;
    await link.send(kFilePutBegin,
        meta: {'name': name, 'size': bytes.length, 'sha256': hex});
    const chunk = 256 * 1024;
    var offset = 0;
    while (offset < bytes.length) {
      final end = (offset + chunk).clamp(0, bytes.length);
      await link.send(kFileChunk,
          meta: {'offset': offset},
          blob: Uint8List.sublistView(bytes, offset, end));
      offset = end;
      onProgress?.call(offset, bytes.length);
    }
    await link.send(kFilePutEnd, meta: {'name': name});
  }

  Future<void> close() async {
    final l = _link;
    if (l != null) {
      try {
        await l.send(kSessionClosed);
      } catch (_) {}
      await l.close();
      _link = null;
    }
  }
}

String jsonPretty(Object o) => const JsonEncoder.withIndent('  ').convert(o);
