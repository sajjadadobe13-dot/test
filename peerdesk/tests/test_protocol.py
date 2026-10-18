import unittest

from peerdesk import protocol as p


class EncodeDecodeTests(unittest.TestCase):
    def test_round_trip_control_message(self):
        raw = p.encode(p.HELLO, {"name": "Alice", "device_id": "123456789"})
        buf = p.MessageBuffer()
        buf.feed(raw)
        msg = buf.next()
        self.assertIsNotNone(msg)
        self.assertEqual(msg.kind, p.HELLO)
        self.assertEqual(msg.meta["name"], "Alice")
        self.assertEqual(msg.meta["device_id"], "123456789")
        self.assertEqual(msg.blob, b"")

    def test_round_trip_with_binary_blob(self):
        blob = bytes(range(256)) * 4
        raw = p.encode(p.FILE_CHUNK, {"offset": 1024}, blob=blob)
        buf = p.MessageBuffer()
        buf.feed(raw)
        msg = buf.next()
        self.assertEqual(msg.kind, p.FILE_CHUNK)
        self.assertEqual(msg.meta["offset"], 1024)
        self.assertEqual(msg.blob, blob)

    def test_streaming_partial_bytes(self):
        raw = p.encode(p.PING, {"t": 1})
        buf = p.MessageBuffer()
        # feed one byte at a time; only the final byte completes the message
        for i, byte in enumerate(raw):
            buf.feed(bytes([byte]))
            msg = buf.next()
            if i < len(raw) - 1:
                self.assertIsNone(msg, f"completed too early at byte {i}")
            else:
                self.assertIsNotNone(msg)
                self.assertEqual(msg.kind, p.PING)

    def test_multiple_messages_in_one_feed(self):
        raw = p.encode(p.PING, {"n": 1}) + p.encode(p.PONG, {"n": 2})
        buf = p.MessageBuffer()
        buf.feed(raw)
        kinds = [m.kind for m in buf]
        self.assertEqual(kinds, [p.PING, p.PONG])

    def test_bad_magic_raises(self):
        buf = p.MessageBuffer()
        buf.feed(b"XXXX" + b"\x00" * 20)
        with self.assertRaises(p.ProtocolError):
            buf.next()

    def test_oversized_message_rejected(self):
        buf = p.MessageBuffer(max_message=10)
        raw = p.encode(p.FILE_CHUNK, {}, blob=b"x" * 100)
        buf.feed(raw)
        with self.assertRaises(p.ProtocolError):
            buf.next()

    def test_flags_preserved(self):
        raw = p.encode(p.FRAME, {"seq": 1}, blob=b"abc", flags=p.FLAG_ENCRYPTED)
        buf = p.MessageBuffer()
        buf.feed(raw)
        msg = buf.next()
        self.assertEqual(msg.flags & p.FLAG_ENCRYPTED, p.FLAG_ENCRYPTED)


if __name__ == "__main__":
    unittest.main()
