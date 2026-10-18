/// Lightweight persistent settings for the mobile app: a stable device id and
/// a display name, stored as JSON in the app documents directory.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:path_provider/path_provider.dart';

class AppConfig {
  String deviceId;
  String deviceName;
  int defaultPort;

  AppConfig({
    required this.deviceId,
    required this.deviceName,
    this.defaultPort = 7420,
  });

  static const _fileName = 'peerdesk_config.json';
  static AppConfig? _cached;

  static Future<AppConfig> load() async {
    if (_cached != null) return _cached!;
    try {
      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/$_fileName');
      if (await file.exists()) {
        final data = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
        _cached = AppConfig(
          deviceId: data['device_id'] as String? ?? _newId(),
          deviceName: data['device_name'] as String? ?? 'PeerDesk Phone',
          defaultPort: (data['default_port'] as num?)?.toInt() ?? 7420,
        );
        return _cached!;
      }
    } catch (_) {
      // fall through to defaults
    }
    final cfg = AppConfig(deviceId: _newId(), deviceName: 'PeerDesk Phone');
    _cached = cfg;
    await cfg.save();
    return cfg;
  }

  Future<void> save() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/$_fileName');
      await file.writeAsString(jsonEncode({
        'device_id': deviceId,
        'device_name': deviceName,
        'default_port': defaultPort,
      }));
    } catch (_) {
      // non-fatal: settings just won't persist
    }
  }

  static String _newId() {
    final r = Random.secure();
    return (100000000 + r.nextInt(900000000)).toString();
  }
}
