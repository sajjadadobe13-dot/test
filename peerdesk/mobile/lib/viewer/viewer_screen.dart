import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../core/app_config.dart';
import '../core/protocol.dart';
import '../core/sessions.dart';
import 'viewer_client.dart';

enum _Phase { form, connecting, session, ended }

class ViewerScreen extends StatefulWidget {
  final AppConfig? config;
  const ViewerScreen({super.key, this.config});
  @override
  State<ViewerScreen> createState() => _ViewerScreenState();
}

class _ViewerScreenState extends State<ViewerScreen> {
  final _host = TextEditingController();
  final _port = TextEditingController(text: '7420');
  final _password = TextEditingController();
  bool _reqControl = true;
  bool _reqFiles = true;
  bool _reqClipboard = true;

  _Phase _phase = _Phase.form;
  String _status = '';
  ViewerClient? _client;

  final Map<String, ui.Image> _tiles = {};
  int _screenW = 0;
  int _screenH = 0;
  Size _canvas = Size.zero;
  bool _dragMode = false;
  Set<Permission> _granted = {};

  @override
  void initState() {
    super.initState();
    if (widget.config != null) _port.text = widget.config!.defaultPort.toString();
  }

  @override
  void dispose() {
    _client?.close();
    _host.dispose();
    _port.dispose();
    _password.dispose();
    super.dispose();
  }

  Set<Permission> get _requested {
    final s = <Permission>{Permission.view};
    if (_reqControl) s.add(Permission.control);
    if (_reqFiles) s.add(Permission.fileTransfer);
    if (_reqClipboard) s.add(Permission.clipboard);
    return s;
  }

  Future<void> _connect() async {
    final host = _host.text.trim();
    if (host.isEmpty) {
      _snack('Enter the PC address');
      return;
    }
    final port = int.tryParse(_port.text.trim()) ?? 7420;
    setState(() {
      _phase = _Phase.connecting;
      _status = 'Connecting...';
    });
    final client = ViewerClient(
      name: widget.config?.deviceName ?? 'PeerDesk Mobile',
      deviceId: widget.config?.deviceId ?? '',
    );
    try {
      await client.connect(host, port);
      setState(() => _status = 'Waiting for the remote user to accept...');
      final result =
          await client.negotiate(_requested, password: _password.text);
      _client = client;
      setState(() {
        _granted = result.granted;
        _screenW = result.screenWidth;
        _screenH = result.screenHeight;
        _phase = _Phase.session;
      });
      _receiveLoop();
    } on SessionRejected catch (e) {
      await client.close();
      _fail('Declined: ${e.reason}');
    } on AuthFailed {
      await client.close();
      _fail('Incorrect password');
    } catch (e) {
      await client.close();
      _fail('Could not connect: $e');
    }
  }

  void _fail(String message) {
    if (!mounted) return;
    setState(() {
      _phase = _Phase.form;
      _status = '';
    });
    _snack(message);
  }

  Future<void> _receiveLoop() async {
    final client = _client;
    if (client == null) return;
    try {
      while (mounted && _client != null) {
        final msg = await client.recv();
        switch (msg.kind) {
          case kFrame:
            await _applyTile(msg);
            break;
          case kFileProgress:
            if (msg.get<bool>('done') == true) _snack('File delivered to PC');
            break;
          case kFileError:
            _snack('File error: ${msg.get<String>('message') ?? ''}');
            break;
          case kPermissionUpdate:
            setState(() => _granted = Permission.fromWireList(
                (msg.meta['granted'] as List?) ?? const []));
            break;
          case kSessionClosed:
            _endSession('The PC ended the session');
            return;
        }
      }
    } catch (_) {
      _endSession('Disconnected');
    }
  }

  Future<void> _applyTile(dynamic msg) async {
    final blob = (msg.blob as Uint8List);
    if (blob.isEmpty) return;
    final codec = await ui.instantiateImageCodec(blob);
    final frame = await codec.getNextFrame();
    final x = (msg.meta['x'] as num?)?.toInt() ?? 0;
    final y = (msg.meta['y'] as num?)?.toInt() ?? 0;
    if (!mounted) return;
    setState(() => _tiles['${x}_$y'] = frame.image);
  }

  void _endSession(String why) {
    if (!mounted || _phase == _Phase.ended) return;
    setState(() {
      _phase = _Phase.ended;
      _status = why;
    });
    _client?.close();
    _client = null;
  }

  // --- input ---------------------------------------------------------------
  (double, double)? _normalise(Offset local) {
    if (_screenW == 0 || _screenH == 0 || _canvas == Size.zero) return null;
    final scale = (_canvas.width / _screenW).clamp(0.0, double.infinity);
    final s = scale < _canvas.height / _screenH
        ? _canvas.width / _screenW
        : _canvas.height / _screenH;
    final dispW = _screenW * s;
    final dispH = _screenH * s;
    final ox = (_canvas.width - dispW) / 2;
    final oy = (_canvas.height - dispH) / 2;
    final nx = ((local.dx - ox) / dispW).clamp(0.0, 1.0);
    final ny = ((local.dy - oy) / dispH).clamp(0.0, 1.0);
    return (nx, ny);
  }

  void _sendMouse(String type, Offset local, {String button = 'left'}) {
    if (!_granted.contains(Permission.control)) return;
    final n = _normalise(local);
    final payload = <String, dynamic>{'type': type, 'button': button};
    if (n != null) {
      payload['x'] = n.$1;
      payload['y'] = n.$2;
    }
    _client?.sendInput(payload);
  }

  void _tap(Offset local, {String button = 'left'}) {
    if (!_granted.contains(Permission.control)) return;
    _sendMouse('mouse_move', local);
    _sendMouse('mouse_down', local, button: button);
    _sendMouse('mouse_up', local, button: button);
  }

  Future<void> _pickAndSend() async {
    final res = await FilePicker.platform.pickFiles();
    final path = res?.files.single.path;
    if (path == null) return;
    _snack('Sending ${path.split('/').last}...');
    try {
      await _client?.sendFile(path);
    } catch (e) {
      _snack('Send failed: $e');
    }
  }

  void _sendKey(String key) {
    if (!_granted.contains(Permission.control)) return;
    _client?.sendInput({'type': 'key', 'action': 'press', 'key': key});
  }

  void _typeText(String text) {
    for (final ch in text.characters) {
      _sendKey(ch == '\n' ? 'enter' : ch);
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(m), duration: const Duration(seconds: 2)));
  }

  // --- UI ------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    switch (_phase) {
      case _Phase.form:
        return _buildForm();
      case _Phase.connecting:
        return _buildConnecting();
      case _Phase.session:
        return _buildSession();
      case _Phase.ended:
        return _buildEnded();
    }
  }

  Widget _buildForm() {
    return Scaffold(
      appBar: AppBar(title: const Text('Control a PC')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          TextField(
            controller: _host,
            decoration: const InputDecoration(
                labelText: 'PC address (IP on your network)',
                hintText: 'e.g. 192.168.1.42'),
            keyboardType: TextInputType.url,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _port,
            decoration: const InputDecoration(labelText: 'Port'),
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _password,
            decoration: const InputDecoration(
                labelText: 'Password (only if the PC set one)'),
            obscureText: true,
          ),
          const SizedBox(height: 18),
          const Text('Request permission to:',
              style: TextStyle(color: Colors.white70)),
          SwitchListTile(
            value: _reqControl,
            onChanged: (v) => setState(() => _reqControl = v),
            title: const Text('Control keyboard & mouse'),
            contentPadding: EdgeInsets.zero,
          ),
          SwitchListTile(
            value: _reqFiles,
            onChanged: (v) => setState(() => _reqFiles = v),
            title: const Text('Transfer files'),
            contentPadding: EdgeInsets.zero,
          ),
          SwitchListTile(
            value: _reqClipboard,
            onChanged: (v) => setState(() => _reqClipboard = v),
            title: const Text('Share clipboard'),
            contentPadding: EdgeInsets.zero,
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: _connect,
            icon: const Icon(Icons.login),
            label: const Text('Connect'),
          ),
          const SizedBox(height: 12),
          const Text(
            'The person at the PC must accept your connection. Your request is '
            'end-to-end encrypted.',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildConnecting() {
    return Scaffold(
      appBar: AppBar(title: const Text('Connecting')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 20),
            Text(_status, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }

  Widget _buildSession() {
    final canControl = _granted.contains(Permission.control);
    return Scaffold(
      appBar: AppBar(
        title: Text(_client?.result?.hostName.isNotEmpty == true
            ? _client!.result!.hostName
            : 'Remote PC'),
        actions: [
          IconButton(
            tooltip: 'Disconnect',
            icon: const Icon(Icons.call_end),
            onPressed: () {
              _client?.close();
              Navigator.of(context).pop();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: Container(
              color: Colors.black,
              child: LayoutBuilder(builder: (context, constraints) {
                _canvas = Size(constraints.maxWidth, constraints.maxHeight);
                return GestureDetector(
                  onTapUp: canControl ? (d) => _tap(d.localPosition) : null,
                  onLongPressStart: canControl
                      ? (d) => _tap(d.localPosition, button: 'right')
                      : null,
                  onPanStart: canControl && _dragMode
                      ? (d) => _sendMouse('mouse_down', d.localPosition)
                      : null,
                  onPanUpdate:
                      canControl ? (d) => _sendMouse('mouse_move', d.localPosition) : null,
                  onPanEnd: canControl && _dragMode
                      ? (_) => _client?.sendInput({'type': 'mouse_up', 'button': 'left'})
                      : null,
                  child: CustomPaint(
                    size: Size.infinite,
                    painter: _RemotePainter(_tiles, _screenW, _screenH),
                    child: _tiles.isEmpty
                        ? const Center(
                            child: Text('Waiting for screen...',
                                style: TextStyle(color: Colors.white54)))
                        : null,
                  ),
                );
              }),
            ),
          ),
          _buildToolbar(canControl),
        ],
      ),
    );
  }

  Widget _buildToolbar(bool canControl) {
    return Material(
      color: const Color(0xFF1B1E26),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          children: [
            if (canControl)
              IconButton(
                tooltip: 'Keyboard',
                icon: const Icon(Icons.keyboard),
                onPressed: _openKeyboard,
              ),
            if (canControl)
              Row(children: [
                const Text('Drag', style: TextStyle(fontSize: 12)),
                Switch(
                  value: _dragMode,
                  onChanged: (v) => setState(() => _dragMode = v),
                ),
              ]),
            const Spacer(),
            if (_granted.contains(Permission.fileTransfer))
              IconButton(
                tooltip: 'Send file',
                icon: const Icon(Icons.upload_file),
                onPressed: _pickAndSend,
              ),
            if (canControl)
              IconButton(
                tooltip: 'Scroll up',
                icon: const Icon(Icons.keyboard_arrow_up),
                onPressed: () => _client
                    ?.sendInput({'type': 'scroll', 'dx': 0, 'dy': 1}),
              ),
            if (canControl)
              IconButton(
                tooltip: 'Scroll down',
                icon: const Icon(Icons.keyboard_arrow_down),
                onPressed: () => _client
                    ?.sendInput({'type': 'scroll', 'dx': 0, 'dy': -1}),
              ),
          ],
        ),
      ),
    );
  }

  void _openKeyboard() {
    final controller = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1B1E26),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
            left: 12,
            right: 12,
            top: 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    autofocus: true,
                    decoration: const InputDecoration(
                        labelText: 'Type to send to the PC'),
                    onSubmitted: (t) {
                      _typeText(t);
                      _sendKey('enter');
                      controller.clear();
                    },
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.send),
                  onPressed: () {
                    _typeText(controller.text);
                    controller.clear();
                  },
                ),
              ],
            ),
            Wrap(
              spacing: 6,
              children: [
                _keyChip('Esc', 'esc'),
                _keyChip('Tab', 'tab'),
                _keyChip('Enter', 'enter'),
                _keyChip('Back', 'backspace'),
                _keyChip('Del', 'delete'),
                _keyChip('←', 'left'),
                _keyChip('→', 'right'),
                _keyChip('↑', 'up'),
                _keyChip('↓', 'down'),
              ],
            ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  Widget _keyChip(String label, String key) =>
      ActionChip(label: Text(label), onPressed: () => _sendKey(key));

  Widget _buildEnded() {
    return Scaffold(
      appBar: AppBar(title: const Text('Session ended')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.info_outline, size: 48, color: Colors.white54),
            const SizedBox(height: 12),
            Text(_status),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Back'),
            ),
          ],
        ),
      ),
    );
  }
}

class _RemotePainter extends CustomPainter {
  final Map<String, ui.Image> tiles;
  final int screenW;
  final int screenH;
  _RemotePainter(this.tiles, this.screenW, this.screenH);

  @override
  void paint(Canvas canvas, Size size) {
    if (screenW == 0 || screenH == 0) return;
    final s = (size.width / screenW) < (size.height / screenH)
        ? size.width / screenW
        : size.height / screenH;
    final dispW = screenW * s;
    final dispH = screenH * s;
    final ox = (size.width - dispW) / 2;
    final oy = (size.height - dispH) / 2;
    final paint = Paint()..filterQuality = FilterQuality.low;
    tiles.forEach((key, img) {
      final parts = key.split('_');
      final x = int.parse(parts[0]);
      final y = int.parse(parts[1]);
      final dst = Rect.fromLTWH(
          ox + x * s, oy + y * s, img.width * s, img.height * s);
      final src = Rect.fromLTWH(
          0, 0, img.width.toDouble(), img.height.toDouble());
      canvas.drawImageRect(img, src, dst, paint);
    });
  }

  @override
  bool shouldRepaint(_RemotePainter old) => true;
}
