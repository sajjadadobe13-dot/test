import hashlib
import os
import tempfile
import unittest

from peerdesk import filetransfer as ft


class SanitizeTests(unittest.TestCase):
    def test_strips_directory_traversal(self):
        self.assertEqual(ft.sanitize_name("../../etc/passwd"), "passwd")
        self.assertEqual(ft.sanitize_name("..\\..\\windows\\system32\\x.dll"),
                         "x.dll")
        self.assertEqual(ft.sanitize_name("/absolute/path/report.pdf"),
                         "report.pdf")

    def test_empty_or_dots_become_default(self):
        self.assertEqual(ft.sanitize_name(""), "received_file")
        self.assertEqual(ft.sanitize_name(".."), "received_file")
        self.assertEqual(ft.sanitize_name("."), "received_file")


class TransferTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.src_dir = os.path.join(self.tmp.name, "src")
        self.dst_dir = os.path.join(self.tmp.name, "dst")
        os.makedirs(self.src_dir)

    def _make_file(self, name, data):
        path = os.path.join(self.src_dir, name)
        with open(path, "wb") as fh:
            fh.write(data)
        return path

    def _transfer(self, src_path, chunk_size=1024):
        sender = ft.FileSender(src_path, chunk_size=chunk_size)
        receiver = ft.FileReceiver(self.dst_dir)
        receiver.begin(sender.meta())
        for offset, data in sender.chunks():
            receiver.chunk(offset, data)
        return receiver.end()

    def test_round_trip_preserves_bytes(self):
        payload = os.urandom(5000)
        src = self._make_file("doc.bin", payload)
        out = self._transfer(src, chunk_size=256)
        with open(out, "rb") as fh:
            self.assertEqual(fh.read(), payload)

    def test_empty_file(self):
        src = self._make_file("empty.txt", b"")
        out = self._transfer(src)
        self.assertTrue(os.path.exists(out))
        self.assertEqual(os.path.getsize(out), 0)

    def test_checksum_mismatch_detected(self):
        src = self._make_file("x.bin", os.urandom(2048))
        sender = ft.FileSender(src)
        receiver = ft.FileReceiver(self.dst_dir)
        bad_meta = ft.FileMeta(name="x.bin", size=sender.size,
                               sha256="0" * 64)
        receiver.begin(bad_meta)
        for offset, data in sender.chunks():
            receiver.chunk(offset, data)
        with self.assertRaises(ft.FileTransferError):
            receiver.end()
        # corrupt transfer leaves no final file behind
        self.assertFalse(os.path.exists(os.path.join(self.dst_dir, "x.bin")))

    def test_out_of_order_chunk_rejected(self):
        src = self._make_file("y.bin", os.urandom(4096))
        sender = ft.FileSender(src, chunk_size=1024)
        receiver = ft.FileReceiver(self.dst_dir)
        receiver.begin(sender.meta())
        chunks = list(sender.chunks())
        receiver.chunk(*chunks[0])
        with self.assertRaises(ft.FileTransferError):
            receiver.chunk(*chunks[2])  # skipped chunk 1

    def test_dedupe_does_not_clobber(self):
        payload = b"hello world"
        src = self._make_file("note.txt", payload)
        first = self._transfer(src)
        second = self._transfer(src)
        self.assertNotEqual(first, second)
        self.assertTrue(os.path.exists(first))
        self.assertTrue(os.path.exists(second))

    def test_sender_rejects_missing_file(self):
        with self.assertRaises(ft.FileTransferError):
            ft.FileSender(os.path.join(self.src_dir, "nope.bin"))

    def test_hash_file_matches_hashlib(self):
        data = os.urandom(1000)
        src = self._make_file("h.bin", data)
        self.assertEqual(ft.hash_file(src), hashlib.sha256(data).hexdigest())


class DirectoryListingTests(unittest.TestCase):
    def test_listing_sorts_dirs_first(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "zdir"))
            open(os.path.join(d, "afile.txt"), "w").close()
            listing = ft.list_directory(d)
            self.assertEqual(listing[0]["name"], "zdir")
            self.assertTrue(listing[0]["is_dir"])
            self.assertEqual(listing[1]["name"], "afile.txt")


if __name__ == "__main__":
    unittest.main()
