import 'package:flutter/material.dart';

import 'core/app_config.dart';
import 'host/host_screen.dart';
import 'viewer/viewer_screen.dart';

void main() {
  runApp(const PeerDeskApp());
}

class PeerDeskApp extends StatelessWidget {
  const PeerDeskApp({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF2E86DE),
      brightness: Brightness.dark,
    );
    return MaterialApp(
      title: 'PeerDesk',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: scheme,
        scaffoldBackgroundColor: const Color(0xFF12141A),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
          ),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
          isDense: true,
        ),
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  AppConfig? _config;

  @override
  void initState() {
    super.initState();
    AppConfig.load().then((c) => setState(() => _config = c));
  }

  @override
  Widget build(BuildContext context) {
    final cfg = _config;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 16),
              Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: const Color(0xFF2E86DE),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.devices_other, color: Colors.white),
                  ),
                  const SizedBox(width: 14),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text('PeerDesk',
                          style: TextStyle(
                              fontSize: 26, fontWeight: FontWeight.bold)),
                      Text('Remote desktop & file sharing',
                          style: TextStyle(color: Colors.white54)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 28),
              if (cfg != null)
                Card(
                  color: const Color(0xFF1B1E26),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        const Icon(Icons.badge_outlined, color: Colors.white54),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('This device',
                                style: TextStyle(color: Colors.white54)),
                            Text(cfg.deviceId,
                                style: const TextStyle(
                                    fontSize: 20,
                                    fontFeatures: [],
                                    letterSpacing: 2)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 24),
              _RoleCard(
                icon: Icons.desktop_windows_outlined,
                title: 'Control a PC',
                subtitle:
                    'Connect to a computer running PeerDesk and view or control it.',
                badge: 'Recommended',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => ViewerScreen(config: cfg))),
              ),
              const SizedBox(height: 14),
              _RoleCard(
                icon: Icons.screen_share_outlined,
                title: 'Share this phone',
                subtitle:
                    'Let a PC view this phone\'s screen (view-only on Android).',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => HostScreen(config: cfg))),
              ),
              const Spacer(),
              const Center(
                child: Text('v1.0.0 · consent-first',
                    style: TextStyle(color: Colors.white38, fontSize: 12)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String? badge;
  final VoidCallback onTap;
  const _RoleCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF1B1E26),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Icon(icon, size: 34, color: const Color(0xFF40C4A0)),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(title,
                            style: const TextStyle(
                                fontSize: 18, fontWeight: FontWeight.w600)),
                        if (badge != null) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF2E86DE),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(badge!,
                                style: const TextStyle(fontSize: 11)),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(subtitle,
                        style: const TextStyle(color: Colors.white54)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.white38),
            ],
          ),
        ),
      ),
    );
  }
}
