import unittest

from peerdesk.sessions import (
    HostPolicy,
    Peer,
    Permission,
    Session,
    SessionRegistry,
    SessionState,
)


def make_session(requested=None):
    return Session(
        peer=Peer(name="Viewer", device_id="111222333", address="10.0.0.5"),
        requested=requested or {Permission.VIEW, Permission.CONTROL,
                                Permission.FILE_TRANSFER},
    )


class PermissionParsingTests(unittest.TestCase):
    def test_from_list_ignores_unknown(self):
        perms = Permission.from_list(["view", "control", "telepathy"])
        self.assertEqual(perms, {Permission.VIEW, Permission.CONTROL})


class ConsentTests(unittest.TestCase):
    def test_new_session_grants_nothing(self):
        s = make_session()
        self.assertEqual(s.state, SessionState.PENDING)
        self.assertFalse(s.allows(Permission.VIEW))
        self.assertFalse(s.allows(Permission.CONTROL))

    def test_approve_all_grants_requested_plus_view(self):
        s = make_session({Permission.CONTROL, Permission.FILE_TRANSFER})
        s.approve()
        self.assertTrue(s.allows(Permission.VIEW))
        self.assertTrue(s.allows(Permission.CONTROL))
        self.assertTrue(s.allows(Permission.FILE_TRANSFER))

    def test_approve_subset_withholds_control(self):
        s = make_session()
        s.approve({Permission.VIEW})  # operator grants view-only
        self.assertTrue(s.allows(Permission.VIEW))
        self.assertFalse(s.allows(Permission.CONTROL))
        self.assertFalse(s.allows(Permission.FILE_TRANSFER))

    def test_cannot_grant_more_than_requested(self):
        s = make_session({Permission.VIEW})  # viewer only asked to watch
        s.approve({Permission.VIEW, Permission.CONTROL})
        self.assertFalse(s.allows(Permission.CONTROL))

    def test_reject_blocks_everything(self):
        s = make_session()
        s.reject("operator said no")
        self.assertEqual(s.state, SessionState.REJECTED)
        self.assertFalse(s.allows(Permission.VIEW))

    def test_revoke_control_mid_session(self):
        s = make_session()
        s.approve()
        self.assertTrue(s.allows(Permission.CONTROL))
        s.revoke(Permission.CONTROL)
        self.assertFalse(s.allows(Permission.CONTROL))
        self.assertTrue(s.allows(Permission.VIEW))  # still watching

    def test_cannot_revoke_view(self):
        s = make_session()
        s.approve()
        with self.assertRaises(ValueError):
            s.revoke(Permission.VIEW)

    def test_close_revokes_all_one_time(self):
        s = make_session()
        s.approve()
        s.close()
        self.assertEqual(s.state, SessionState.CLOSED)
        self.assertFalse(s.allows(Permission.VIEW))
        self.assertFalse(s.allows(Permission.CONTROL))
        self.assertEqual(s.granted, set())

    def test_double_approve_raises(self):
        s = make_session()
        s.approve()
        with self.assertRaises(RuntimeError):
            s.approve()


class HostPolicyTests(unittest.TestCase):
    def test_policy_strips_forbidden_permissions(self):
        policy = HostPolicy(allow_control=False, allow_file_transfer=True)
        requested = {Permission.VIEW, Permission.CONTROL, Permission.FILE_TRANSFER}
        filtered = policy.filter_requested(requested)
        self.assertIn(Permission.VIEW, filtered)
        self.assertNotIn(Permission.CONTROL, filtered)
        self.assertIn(Permission.FILE_TRANSFER, filtered)

    def test_view_always_allowed(self):
        policy = HostPolicy(allow_control=False, allow_file_transfer=False,
                            allow_clipboard=False)
        self.assertEqual(policy.filter_requested({Permission.VIEW}),
                         {Permission.VIEW})


class RegistryTests(unittest.TestCase):
    def test_registry_tracks_active_sessions(self):
        reg = SessionRegistry()
        s1 = make_session()
        s2 = make_session()
        reg.add(s1)
        reg.add(s2)
        s1.approve()
        self.assertEqual(list(reg.active()), [s1])
        self.assertEqual(len(reg), 2)
        reg.remove(s2.id)
        self.assertEqual(len(reg), 1)


if __name__ == "__main__":
    unittest.main()
