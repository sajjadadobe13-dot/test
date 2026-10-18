import os
import tempfile
import unittest

from peerdesk.config import Config
from peerdesk.sessions import HostPolicy


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, "config.json")

    def test_first_load_creates_file_and_device_id(self):
        cfg = Config.load(self.path)
        self.assertTrue(os.path.exists(self.path))
        self.assertEqual(len(cfg.device_id), 9)
        self.assertTrue(cfg.device_id.isdigit())

    def test_device_id_is_stable_across_loads(self):
        cfg1 = Config.load(self.path)
        cfg2 = Config.load(self.path)
        self.assertEqual(cfg1.device_id, cfg2.device_id)

    def test_changes_persist(self):
        cfg = Config.load(self.path)
        cfg.require_consent = False
        cfg.listen_port = 9999
        cfg.save(self.path)
        reloaded = Config.load(self.path)
        self.assertFalse(reloaded.require_consent)
        self.assertEqual(reloaded.listen_port, 9999)

    def test_corrupt_config_falls_back_to_defaults(self):
        with open(self.path, "w") as fh:
            fh.write("{ this is not valid json ")
        cfg = Config.load(self.path)
        self.assertEqual(len(cfg.device_id), 9)

    def test_unknown_keys_ignored(self):
        with open(self.path, "w") as fh:
            fh.write('{"device_id": "123456789", "mystery_key": 42}')
        cfg = Config.load(self.path)
        self.assertEqual(cfg.device_id, "123456789")
        self.assertFalse(hasattr(cfg, "mystery_key"))

    def test_host_policy_derived_from_config(self):
        cfg = Config.load(self.path)
        cfg.allow_control = False
        policy = cfg.host_policy()
        self.assertIsInstance(policy, HostPolicy)
        self.assertFalse(policy.allow_control)
        self.assertTrue(policy.require_consent)


if __name__ == "__main__":
    unittest.main()
