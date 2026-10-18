/// PeerDesk wire protocol (Dart port of peerdesk/protocol.py).
///
/// Every message on the wire is:
///   MAGIC(4) VERSION(1) FLAGS(1) JSON_LEN(4) BIN_LEN(4) | JSON | BINARY
///
/// This file is pure Dart (no Flutter imports) so it can be unit-tested with
/// the standalone Dart VM and shared across platforms.
library;

import 'dart:convert';
import 'dart:typed_data';

const List<int> kMagic = [0x50, 0x44, 0x53, 0x4b]; // 'PDSK'
const int kProtocolVersion = 1;
const int kHeaderSize = 14;

// Message kinds (must match protocol.py exactly).
const String kHello = 'hello';
const String kServerHello = 'server_hello';
const String kAuthChallenge = 'auth_challenge';
const String kAuthResponse = 'auth_response';
const String kAuthResult = 'auth_result';
const String kSessionRequest = 'session_request';
const String kConsentPending = 'consent_pending';
const String kSessionGranted = 'session_granted';
const String kSessionRejected = 'session_rejected';
const String kSessionClosed = 'session_closed';
const String kPermissionUpdate = 'permission_update';
const String kFrame = 'frame';
const String kScreenInfo = 'screen_info';
const String kInput = 'input';
const String kClipboard = 'clipboard';
const String kFileListReq = 'file_list_req';
const String kFileList = 'file_list';
const String kFilePutBegin = 'file_put_begin';
const String kFileChunk = 'file_chunk';
const String kFilePutEnd = 'file_put_end';
const String kFileGetReq = 'file_get_req';
const String kFileProgress = 'file_progress';
const String kFileError = 'file_error';
const String kPing = 'ping';
const String kPong = 'pong';
const String kError = 'error';

const int kFlagNone = 0;
const int kFlagEncrypted = 1 << 0;

const int kDefaultMaxMessage = 128 * 1024 * 1024;

class ProtocolError implements Exception {
  final String message;
  ProtocolError(this.message);
  @override
  String toString() => 'ProtocolError: $message';
}

class Message {
  final String kind;
  final Map<String, dynamic> meta;
  final Uint8List blob;
  final int flags;

  Message(this.kind, {Map<String, dynamic>? meta, Uint8List? blob, this.flags = kFlagNone})
      : meta = meta ?? <String, dynamic>{},
        blob = blob ?? Uint8List(0);

  T? get<T>(String key, [T? fallback]) => (meta[key] as T?) ?? fallback;
}

/// Serialise a message to bytes ready for the socket.
Uint8List encodeMessage(String kind,
    {Map<String, dynamic>? meta, List<int>? blob, int flags = kFlagNone}) {
  final payload = <String, dynamic>{...?meta, 'kind': kind};
  final jsonBytes = utf8.encode(jsonEncode(payload));
  final blobBytes = blob ?? const <int>[];
  final out = BytesBuilder();
  final header = ByteData(kHeaderSize);
  for (var i = 0; i < 4; i++) {
    header.setUint8(i, kMagic[i]);
  }
  header.setUint8(4, kProtocolVersion);
  header.setUint8(5, flags & 0xff);
  header.setUint32(6, jsonBytes.length, Endian.big);
  header.setUint32(10, blobBytes.length, Endian.big);
  out.add(header.buffer.asUint8List());
  out.add(jsonBytes);
  out.add(blobBytes);
  return out.toBytes();
}

/// Accumulates raw bytes and yields complete [Message]s.
class MessageBuffer {
  final int maxMessage;
  final BytesBuilder _builder = BytesBuilder();
  Uint8List _buf = Uint8List(0);

  MessageBuffer({this.maxMessage = kDefaultMaxMessage});

  void feed(List<int> data) {
    if (data.isEmpty) return;
    // Merge any carried-over bytes with new data.
    if (_buf.isNotEmpty) {
      _builder.add(_buf);
    }
    _builder.add(data);
    _buf = _builder.takeBytes();
  }

  /// Returns the next complete message, or null if more bytes are needed.
  Message? next() {
    if (_buf.length < kHeaderSize) return null;
    final header = ByteData.sublistView(_buf, 0, kHeaderSize);
    for (var i = 0; i < 4; i++) {
      if (header.getUint8(i) != kMagic[i]) {
        throw ProtocolError('bad magic bytes - not a PeerDesk stream');
      }
    }
    final version = header.getUint8(4);
    if (version != kProtocolVersion) {
      throw ProtocolError('unsupported protocol version $version');
    }
    final flags = header.getUint8(5);
    final jsonLen = header.getUint32(6, Endian.big);
    final binLen = header.getUint32(10, Endian.big);
    if (jsonLen + binLen > maxMessage) {
      throw ProtocolError('declared message size exceeds limit');
    }
    final total = kHeaderSize + jsonLen + binLen;
    if (_buf.length < total) return null;

    final jsonBytes = Uint8List.sublistView(_buf, kHeaderSize, kHeaderSize + jsonLen);
    final blob = Uint8List.sublistView(_buf, kHeaderSize + jsonLen, total);
    // Keep an independent copy of the remainder, then advance.
    final blobCopy = Uint8List.fromList(blob);
    _buf = Uint8List.fromList(Uint8List.sublistView(_buf, total));

    final meta = jsonLen > 0
        ? (jsonDecode(utf8.decode(jsonBytes)) as Map<String, dynamic>)
        : <String, dynamic>{};
    final kind = meta.remove('kind');
    if (kind is! String || kind.isEmpty) {
      throw ProtocolError("message is missing its 'kind'");
    }
    return Message(kind, meta: meta, blob: blobCopy, flags: flags);
  }
}
