// Runs the Dart HOST (host_service.dart) against the Dart VIEWER client over a
// real localhost socket, exercising the full encrypted handshake, consent,
// Android control-filtering, screen frames, and a file push.
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:peerdesk_mobile/core/protocol.dart';
import 'package:peerdesk_mobile/core/link.dart';
import 'package:peerdesk_mobile/core/sessions.dart';
import 'package:peerdesk_mobile/host/host_service.dart';
import 'package:peerdesk_mobile/viewer/viewer_client.dart';

// Bind a server on an ephemeral port and serve each connection with the Dart
// host logic. (ScreenShareHost wraps the same serveConnection for the real app;
// here we bind directly so the test can learn the chosen port.)
Future<void> _startHost(HostConfig cfg) async {
  final server = await ServerSocket.bind('127.0.0.1', 0);
  server.listen((socket) {
    final addr = '${socket.remoteAddress.address}:${socket.remotePort}';
    serveConnection(Link(socket), cfg, peerAddress: addr);
  });
  _lastPort = server.port;
  _lastServer = server;
}

int _lastPort = 0;
ServerSocket? _lastServer;

void main() {
  tearDown(() async {
    await _lastServer?.close();
    _lastServer = null;
  });

  test('host grants VIEW + files, filters out CONTROL, streams a frame',
      () async {
    final tmp = await Directory.systemTemp.createTemp('pd_host_');
    final payload = Uint8List.fromList(List<int>.generate(128, (i) => i % 256));
    final cfg = HostConfig(
      deviceId: '900555111',
      deviceName: 'Test Phone',
      frameSourceFactory: () =>
          StaticHostFrameSource(width: 160, height: 120, payload: payload),
      consent: (peer, requested) async => requested, // auto-accept what host allows
      downloadDir: tmp.path,
      targetFps: 20,
    );
    await _startHost(cfg);

    final vc = ViewerClient(name: 'Viewer');
    await vc.connect('127.0.0.1', _lastPort);
    final result = await vc.negotiate(
        {Permission.view, Permission.control, Permission.fileTransfer});

    expect(result.granted.contains(Permission.view), isTrue);
    expect(result.granted.contains(Permission.fileTransfer), isTrue);
    // Android host must never grant control.
    expect(result.granted.contains(Permission.control), isFalse);
    expect(result.screenWidth, 160);
    expect(vc.link.encrypted, isTrue);

    // Receive at least one screen frame carrying our payload.
    var gotFrame = false;
    final deadline = DateTime.now().add(const Duration(seconds: 5));
    while (DateTime.now().isBefore(deadline) && !gotFrame) {
      final msg = await vc.recv(timeout: const Duration(seconds: 5));
      if (msg.kind == kFrame) {
        expect(msg.blob, payload);
        gotFrame = true;
      }
    }
    expect(gotFrame, isTrue);
    await vc.close();
    await tmp.delete(recursive: true);
  });

  test('file push from viewer is saved by the host', () async {
    final tmp = await Directory.systemTemp.createTemp('pd_host_');
    final cfg = HostConfig(
      deviceId: '900555222',
      deviceName: 'Test Phone',
      frameSourceFactory: () => StaticHostFrameSource(width: 80, height: 60),
      consent: (peer, requested) async => requested,
      downloadDir: tmp.path,
    );
    await _startHost(cfg);

    final vc = ViewerClient(name: 'Viewer');
    await vc.connect('127.0.0.1', _lastPort);
    await vc.negotiate({Permission.view, Permission.fileTransfer});

    final src = File('${tmp.path}/payload.bin');
    final data = Uint8List.fromList(List<int>.generate(3000, (i) => i % 251));
    await src.writeAsBytes(data);
    await vc.sendFile(src.path);

    String? savedPath;
    final deadline = DateTime.now().add(const Duration(seconds: 5));
    while (DateTime.now().isBefore(deadline) && savedPath == null) {
      final msg = await vc.recv(timeout: const Duration(seconds: 5));
      if (msg.kind == kFileProgress && msg.get<bool>('done') == true) {
        savedPath = msg.get<String>('path');
      }
    }
    expect(savedPath, isNotNull);
    final saved = await File(savedPath!).readAsBytes();
    expect(saved, data);
    await vc.close();
    await tmp.delete(recursive: true);
  });

  test('password auth: correct password connects', () async {
    final tmp = await Directory.systemTemp.createTemp('pd_host_');
    final cfg = HostConfig(
      deviceId: '900555333',
      deviceName: 'Locked Phone',
      unattendedPassword: 'letmein',
      frameSourceFactory: () => StaticHostFrameSource(width: 80, height: 60),
      consent: (peer, requested) async => requested,
      downloadDir: tmp.path,
    );
    await _startHost(cfg);

    final vc = ViewerClient(name: 'Viewer');
    await vc.connect('127.0.0.1', _lastPort);
    final result =
        await vc.negotiate({Permission.view}, password: 'letmein');
    expect(result.granted.contains(Permission.view), isTrue);
    await vc.close();
    await tmp.delete(recursive: true);
  });

  test('password auth: wrong password is rejected', () async {
    final tmp = await Directory.systemTemp.createTemp('pd_host_');
    final cfg = HostConfig(
      deviceId: '900555444',
      deviceName: 'Locked Phone',
      unattendedPassword: 'letmein',
      frameSourceFactory: () => StaticHostFrameSource(width: 80, height: 60),
      consent: (peer, requested) async => requested,
      downloadDir: tmp.path,
    );
    await _startHost(cfg);

    final vc = ViewerClient(name: 'Viewer');
    await vc.connect('127.0.0.1', _lastPort);
    await expectLater(
      vc.negotiate({Permission.view}, password: 'wrong'),
      throwsA(isA<AuthFailed>()),
    );
    await vc.close();
    await tmp.delete(recursive: true);
  });
}
