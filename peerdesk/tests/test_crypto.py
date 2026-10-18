import unittest

from peerdesk import crypto


class DeviceIdTests(unittest.TestCase):
    def test_device_id_is_nine_digits(self):
        for _ in range(50):
            did = crypto.generate_device_id()
            self.assertEqual(len(did), 9)
            self.assertTrue(did.isdigit())
            self.assertNotEqual(did[0], "0")

    def test_tokens_are_unique(self):
        tokens = {crypto.generate_session_token() for _ in range(100)}
        self.assertEqual(len(tokens), 100)


class ChallengeResponseTests(unittest.TestCase):
    def test_correct_password_passes(self):
        salt = crypto.make_salt()
        nonce = crypto.make_nonce()
        key_host = crypto.derive_key("hunter2", salt)
        key_viewer = crypto.derive_key("hunter2", salt)
        answer = crypto.challenge_answer(key_viewer, nonce)
        self.assertTrue(crypto.verify_answer(key_host, nonce, answer))

    def test_wrong_password_fails(self):
        salt = crypto.make_salt()
        nonce = crypto.make_nonce()
        key_host = crypto.derive_key("correct-horse", salt)
        key_viewer = crypto.derive_key("wrong-password", salt)
        answer = crypto.challenge_answer(key_viewer, nonce)
        self.assertFalse(crypto.verify_answer(key_host, nonce, answer))

    def test_derive_key_is_deterministic(self):
        salt = crypto.make_salt()
        self.assertEqual(crypto.derive_key("p", salt), crypto.derive_key("p", salt))

    def test_different_salt_changes_key(self):
        self.assertNotEqual(
            crypto.derive_key("p", crypto.make_salt()),
            crypto.derive_key("p", crypto.make_salt()),
        )


class SecureChannelTests(unittest.TestCase):
    def test_encrypt_decrypt_round_trip(self):
        salt = crypto.make_salt()
        a = crypto.SecureChannel.from_password("s3cret", salt)
        b = crypto.SecureChannel.from_password("s3cret", salt)
        plaintext = b"screen frame bytes \x00\x01\x02"
        self.assertEqual(b.decrypt(a.encrypt(plaintext)), plaintext)

    def test_tampered_ciphertext_rejected(self):
        salt = crypto.make_salt()
        chan = crypto.SecureChannel.from_password("s3cret", salt)
        token = bytearray(chan.encrypt(b"hello"))
        token[-1] ^= 0xFF
        with self.assertRaises(ValueError):
            chan.decrypt(bytes(token))

    def test_wrong_key_cannot_decrypt(self):
        salt = crypto.make_salt()
        a = crypto.SecureChannel.from_password("right", salt)
        b = crypto.SecureChannel.from_password("wrong", salt)
        with self.assertRaises(ValueError):
            b.decrypt(a.encrypt(b"secret"))

    def test_b64_round_trip(self):
        data = crypto.make_nonce()
        self.assertEqual(crypto.b64d(crypto.b64e(data)), data)


if __name__ == "__main__":
    unittest.main()
