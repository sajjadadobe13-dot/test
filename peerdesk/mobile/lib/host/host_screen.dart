import 'dart:io';

import 'package:flutter/material.dart';

import '../core/app_config.dart';
import '../core/sessions.dart';
import 'host_service.dart';
import 'screen_capture.dart';

class HostScreen extends StatefulWidget {
  final AppConfig? config;
  const HostScreen({super.key, this.config});
  @override
  State<HostScreen> createState() => _HostScreenState();
}

class _HostScreenState extends State<HostScreen> {
  ScreenShareHost? _host;
  final List<String> _log = [];
  List<String> _addresses = [];
  bool _starting = false;

  @override
  void initState() {
    super.initState();
    _loadAddresses();
  }

  @override
  void dispose() {
    _host?.stop();
    super.dispose();
  }

  Future<void> _loadAddresses() async {
    final out = <String>[];
    try {
      for (final iface in await NetworkInterface.list(
          type: InternetAddressType.IPv4, includeLoopback: false)) {
        for (final addr in iface.addresses) {
          out.add(addr.address);
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _addresses = out);
  }

  void _appendLog(String m) {
    if (!mounted) return;
    setState(() {
      _log.insert(0, m);
      if (_log.length > 100) _log.removeLast();
    });
  }

  Future<Set<Permission>?> _consent(
      PeerInfo peer, Set<Permission> requested) async {
    final granted = <Permission, bool>{
      for (final p in requested) p: true,
    };
    final accepted = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Connection request'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${peer.label()}\nwants to connect to this phone.'),
              const SizedBox(height: 10),
              const Text('Allow:', style: TextStyle(color: Colors.white70)),
              for (final p in requested)
                if (p != Permission.view)
                  CheckboxListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    value: granted[p],
                    onChanged: (v) => setLocal(() => granted[p] = v ?? false),
                    title: Text(permissionLabel(p)),
                  ),
              const Text('Screen viewing is always included.',
                  style: TextStyle(color: Colors.white38, fontSize: 12)),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Reject')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Accept')),
          ],
        ),
      ),
    );
    if (accepted != true) return null;
    return {
      Permission.view,
      ...granted.entries.where((e) => e.value).map((e) => e.key),
    };
  }

  Future<void> _start() async {
    setState(() => _starting = true);
    final granted = await ScreenCapture.start(maxFps: 8);
    if (!granted) {
      setState(() => _starting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Screen capture permission was not granted.')));
      }
      return;
    }
    final cfg = widget.config;
    final dir = Directory.systemTemp.path;
    final host = ScreenShareHost(
      HostConfig(
        deviceId: cfg?.deviceId ?? '000000000',
        deviceName: cfg?.deviceName ?? 'PeerDesk Phone',
        frameSourceFactory: () => MediaProjectionFrameSource(),
        consent: _consent,
        downloadDir: dir,
        log: _appendLog,
      ),
      port: cfg?.defaultPort ?? 7420,
    );
    await host.start();
    setState(() {
      _host = host;
      _starting = false;
    });
  }

  Future<void> _stop() async {
    await _host?.stop();
    await ScreenCapture.stop();
    setState(() => _host = null);
  }

  @override
  Widget build(BuildContext context) {
    final sharing = _host != null;
    final cfg = widget.config;
    return Scaffold(
      appBar: AppBar(title: const Text('Share this phone')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              color: const Color(0xFF1B1E26),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('On the PC, open PeerDesk → Viewer and enter:',
                        style: TextStyle(color: Colors.white70)),
                    const SizedBox(height: 8),
                    if (_addresses.isEmpty)
                      const Text('(no Wi-Fi address found)')
                    else
                      for (final a in _addresses)
                        Text('$a : ${cfg?.defaultPort ?? 7420}',
                            style: const TextStyle(
                                fontSize: 18, letterSpacing: 1)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF2A2320),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF6B4A1F)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, color: Color(0xFFE0A106)),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'View-only: Android does not allow a remote PC to control '
                      'this phone\'s touch/keyboard. The PC can watch the screen '
                      'and exchange files.',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _starting ? null : (sharing ? _stop : _start),
              icon: Icon(sharing ? Icons.stop : Icons.screen_share),
              label: Text(sharing ? 'Stop sharing' : 'Start sharing'),
            ),
            const SizedBox(height: 16),
            const Text('Activity', style: TextStyle(color: Colors.white54)),
            const SizedBox(height: 6),
            Expanded(
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: ListView(
                  children: _log
                      .map((l) => Text(l,
                          style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 11,
                              color: Colors.white70)))
                      .toList(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
