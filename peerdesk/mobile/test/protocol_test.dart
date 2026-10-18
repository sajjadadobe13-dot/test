import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:peerdesk_mobile/core/protocol.dart';

void main() {
  test('round-trip control message', () {
    final raw = encodeMessage(kHello, meta: {'name': 'Alice', 'device_id': '123'});
    final buf = MessageBuffer()..feed(raw);
    final msg = buf.next()!;
    expect(msg.kind, kHello);
    expect(msg.meta['name'], 'Alice');
    expect(msg.blob.length, 0);
  });

  test('round-trip with binary blob', () {
    final blob = Uint8List.fromList(List<int>.generate(1000, (i) => i % 256));
    final raw = encodeMessage(kFileChunk, meta: {'offset': 512}, blob: blob);
    final buf = MessageBuffer()..feed(raw);
    final msg = buf.next()!;
    expect(msg.kind, kFileChunk);
    expect(msg.meta['offset'], 512);
    expect(msg.blob, blob);
  });

  test('streaming: completes only on the final byte', () {
    final raw = encodeMessage(kPing, meta: {'t': 1});
    final buf = MessageBuffer();
    for (var i = 0; i < raw.length; i++) {
      buf.feed(Uint8List.fromList([raw[i]]));
      final msg = buf.next();
      if (i < raw.length - 1) {
        expect(msg, isNull, reason: 'completed early at byte $i');
      } else {
        expect(msg, isNotNull);
        expect(msg!.kind, kPing);
      }
    }
  });

  test('two messages in one feed', () {
    final raw = Uint8List.fromList(
        encodeMessage(kPing, meta: {'n': 1}) + encodeMessage(kPong, meta: {'n': 2}));
    final buf = MessageBuffer()..feed(raw);
    expect(buf.next()!.kind, kPing);
    expect(buf.next()!.kind, kPong);
    expect(buf.next(), isNull);
  });

  test('bad magic throws', () {
    final buf = MessageBuffer()
      ..feed(Uint8List.fromList([88, 88, 88, 88, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(() => buf.next(), throwsA(isA<ProtocolError>()));
  });

  test('flags preserved', () {
    final raw = encodeMessage(kFrame,
        meta: {'seq': 1}, blob: [1, 2, 3], flags: kFlagEncrypted);
    final msg = (MessageBuffer()..feed(raw)).next()!;
    expect(msg.flags & kFlagEncrypted, kFlagEncrypted);
  });
}
