/// Async socket transport that speaks the PeerDesk protocol with optional
/// transparent encryption (Dart port of peerdesk/link.py).
///
/// Decryption is applied lazily when a message is handed to the caller (not
/// when bytes arrive), so a cleartext handshake message and the first
/// encrypted message can safely arrive in the same TCP segment: the outer
/// framing is always cleartext, and by the time the caller pulls the encrypted
/// one, [enableEncryption] has run -- exactly matching the Python ordering.
library;

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'crypto.dart';
import 'protocol.dart';

class LinkClosed implements Exception {
  final String message;
  LinkClosed(this.message);
  @override
  String toString() => 'LinkClosed: $message';
}

class Link {
  final Socket _socket;
  final MessageBuffer _buffer = MessageBuffer();
  final List<Message> _queue = [];
  SecureChannel? _channel;
  bool _closed = false;
  Object? _error;
  Completer<void>? _waiter;
  StreamSubscription<Uint8List>? _sub;

  Link(this._socket) {
    _sub = _socket.listen(
      _onData,
      onError: (Object e) => _fail(e),
      onDone: () => _fail(LinkClosed('peer closed the connection')),
      cancelOnError: true,
    );
  }

  static Future<Link> connect(String host, int port,
      {Duration timeout = const Duration(seconds: 15)}) async {
    final socket = await Socket.connect(host, port, timeout: timeout);
    socket.setOption(SocketOption.tcpNoDelay, true);
    return Link(socket);
  }

  bool get encrypted => _channel != null;
  bool get closed => _closed;

  void enableEncryption(SecureChannel channel) {
    _channel = channel;
  }

  void _onData(Uint8List data) {
    try {
      _buffer.feed(data);
      while (true) {
        final msg = _buffer.next();
        if (msg == null) break;
        _queue.add(msg); // raw outer frame; decrypt lazily in recv()
      }
    } catch (e) {
      _fail(e);
      return;
    }
    _wake();
  }

  void _fail(Object e) {
    _closed = true;
    _error ??= e;
    _wake();
  }

  void _wake() {
    final w = _waiter;
    if (w != null && !w.isCompleted) {
      _waiter = null;
      w.complete();
    }
  }

  /// Send a message, encrypting it if a channel is active.
  Future<void> send(String kind,
      {Map<String, dynamic>? meta, List<int>? blob}) async {
    if (_closed) throw LinkClosed('link is closed');
    final plain = encodeMessage(kind, meta: meta, blob: blob);
    Uint8List wire;
    if (_channel != null) {
      final sealed = await _channel!.encrypt(plain);
      wire = encodeMessage(kind,
          meta: {'enc': 1}, blob: sealed, flags: kFlagEncrypted);
    } else {
      wire = plain;
    }
    try {
      _socket.add(wire);
      await _socket.flush();
    } catch (e) {
      _fail(e);
      throw LinkClosed('$e');
    }
  }

  /// Block until the next message is available, decrypting if needed.
  Future<Message> recv({Duration? timeout}) async {
    while (true) {
      if (_queue.isNotEmpty) {
        final raw = _queue.removeAt(0);
        return _maybeDecrypt(raw);
      }
      if (_closed) {
        throw _error is Object ? _error! : LinkClosed('link closed');
      }
      final waiter = Completer<void>();
      _waiter = waiter;
      if (timeout != null) {
        await waiter.future.timeout(timeout, onTimeout: () {
          if (!waiter.isCompleted) {
            _waiter = null;
            throw TimeoutException('no message within timeout');
          }
        });
      } else {
        await waiter.future;
      }
    }
  }

  Future<Message> _maybeDecrypt(Message msg) async {
    if ((msg.flags & kFlagEncrypted) == 0) return msg;
    final chan = _channel;
    if (chan == null) {
      throw LinkClosed('received encrypted message before key exchange');
    }
    final plain = await chan.decrypt(msg.blob);
    final inner = MessageBuffer()..feed(plain);
    final decoded = inner.next();
    if (decoded == null) {
      throw ProtocolError('malformed encrypted envelope');
    }
    return decoded;
  }

  Future<void> close() async {
    _closed = true;
    try {
      await _sub?.cancel();
    } catch (_) {}
    try {
      await _socket.flush();
    } catch (_) {}
    try {
      _socket.destroy();
    } catch (_) {}
  }
}
