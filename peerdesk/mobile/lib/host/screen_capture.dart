/// Dart side of the Android MediaProjection screen-capture bridge.
///
/// The native side (ScreenCapturePlugin.kt) streams full-screen JPEG frames
/// over an EventChannel after the user grants the system capture permission.
/// If the native side is unavailable (e.g. running on an unsupported platform),
/// [start] returns false and the host UI reports it rather than crashing.
library;

import 'dart:async';

import 'package:flutter/services.dart';

import 'host_service.dart';

const _method = MethodChannel('peerdesk/screen');
const _events = EventChannel('peerdesk/frames');

class ScreenCapture {
  /// Ask the OS for screen-capture permission and begin streaming frames.
  /// Returns true if capture started (user granted permission).
  static Future<bool> start({int maxFps = 8}) async {
    try {
      final ok = await _method.invokeMethod<bool>('start', {'fps': maxFps});
      return ok ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  static Future<void> stop() async {
    try {
      await _method.invokeMethod('stop');
    } catch (_) {}
  }

  static Stream<Map> frames() =>
      _events.receiveBroadcastStream().map((e) => (e as Map));
}

/// A [FrameSource] fed by the MediaProjection event stream. Emits the whole
/// screen as a single JPEG tile whenever a new frame has arrived.
class MediaProjectionFrameSource implements FrameSource {
  StreamSubscription<Map>? _sub;
  Uint8List? _latest;
  int _w = 0;
  int _h = 0;
  bool _dirty = false;

  MediaProjectionFrameSource() {
    _sub = ScreenCapture.frames().listen((f) {
      final jpeg = f['jpeg'];
      if (jpeg is Uint8List) {
        _latest = jpeg;
        _w = (f['width'] as num?)?.toInt() ?? _w;
        _h = (f['height'] as num?)?.toInt() ?? _h;
        _dirty = true;
      }
    });
  }

  @override
  (int, int) screenSize() => (_w == 0 ? 1080 : _w, _h == 0 ? 1920 : _h);

  @override
  Future<List<HostTile>> nextTiles() async {
    if (!_dirty || _latest == null) return [];
    _dirty = false;
    final (w, h) = screenSize();
    return [HostTile(0, 0, w, h, _latest!)];
  }

  @override
  void dispose() {
    _sub?.cancel();
    ScreenCapture.stop();
  }
}
