"""End-to-end test of the real host and viewer over a connected socket pair.

No display or input device is touched: the host uses a StaticFrameSource and a
RecordingInputSink, and consent is granted by a scripted provider.  This
exercises the full wire protocol including the X25519 key exchange and
transparent encryption.
"""

import os
import socket
import tempfile
import threading
import time
import unittest

from peerdesk.capture import StaticFrameSource
from peerdesk.host import HostContext, serve_connection
from peerdesk.inputctrl import RecordingInputSink
from peerdesk.link import Link
from peerdesk import protocol
from peerdesk.sessions import Permission
from peerdesk.viewer import ViewerClient


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.sink = RecordingInputSink(size=(320, 240))
        self.logs = []

    def _run_host(self, policy_kwargs=None, consent=None):
        from peerdesk.sessions import HostPolicy
        policy = HostPolicy(**(policy_kwargs or {}))
        a, b = socket.socketpair()
        host_link = Link(a)
        viewer_link = Link(b)

        def default_consent(session):
            return set(session.requested)

        ctx = HostContext(
            device_id="900000001",
            device_name="Test Host",
            policy=policy,
            consent_provider=consent or default_consent,
            download_dir=self.tmp.name,
            frame_source_factory=lambda: StaticFrameSource(size=(320, 240)),
            input_sink=self.sink,
            target_fps=30,
            log=self.logs.append,
        )
        t = threading.Thread(target=serve_connection,
                             args=(host_link, ctx, "test-peer"), daemon=True)
        t.start()
        vc = ViewerClient(name="Tester", device_id="900000002")
        vc.attach_link(viewer_link)
        return vc, t

    def test_full_session_grants_control_and_streams(self):
        vc, t = self._run_host()
        result = vc.negotiate({Permission.VIEW, Permission.CONTROL,
                               Permission.FILE_TRANSFER})
        self.assertIn(Permission.CONTROL, result.granted)
        self.assertEqual(result.screen, (320, 240))
        self.assertEqual(result.host_id, "900000001")

        # send an input event and confirm the host applied it
        vc.send_input({"type": "mouse_move", "x": 0.5, "y": 0.5})

        # read until we see at least one screen frame
        got_frame = False
        deadline = time.time() + 5
        while time.time() < deadline and not got_frame:
            msg = vc.recv(timeout=5)
            if msg.kind == protocol.FRAME:
                got_frame = True
                self.assertTrue(len(msg.blob) > 0)
        self.assertTrue(got_frame, "no screen frame received")

        # the input event should have reached the recording sink
        deadline = time.time() + 2
        while time.time() < deadline and not self.sink.events:
            time.sleep(0.02)
        self.assertTrue(self.sink.events)
        self.assertEqual(self.sink.events[0]["type"], "mouse_move")
        vc.close()

    def test_view_only_blocks_input(self):
        # operator grants only VIEW even though CONTROL was requested
        vc, t = self._run_host(
            consent=lambda s: {Permission.VIEW})
        result = vc.negotiate({Permission.VIEW, Permission.CONTROL})
        self.assertNotIn(Permission.CONTROL, result.granted)
        vc.send_input({"type": "mouse_move", "x": 0.1, "y": 0.1})
        time.sleep(0.3)
        self.assertEqual(self.sink.events, [], "input applied without permission")
        vc.close()

    def test_rejected_session_raises(self):
        from peerdesk.viewer import SessionRejected
        vc, t = self._run_host(consent=lambda s: None)  # decline
        with self.assertRaises(SessionRejected):
            vc.negotiate({Permission.VIEW, Permission.CONTROL})
        vc.close()

    def test_file_push_to_host(self):
        vc, t = self._run_host()
        vc.negotiate({Permission.VIEW, Permission.FILE_TRANSFER})
        payload = os.urandom(4096)
        src = os.path.join(self.tmp.name, "upload.bin")
        with open(src, "wb") as fh:
            fh.write(payload)
        vc.send_file(src)

        # wait for the host to report the saved file
        saved_path = None
        deadline = time.time() + 5
        while time.time() < deadline and saved_path is None:
            msg = vc.recv(timeout=5)
            if msg.kind == protocol.FILE_PROGRESS and msg.get("done"):
                saved_path = msg.get("path")
        self.assertIsNotNone(saved_path, "host never confirmed the file")
        with open(saved_path, "rb") as fh:
            self.assertEqual(fh.read(), payload)
        vc.close()

    def test_password_auth_required(self):
        vc, t = self._run_host(policy_kwargs={"unattended_password": "letmein"})
        result = vc.negotiate({Permission.VIEW}, password="letmein")
        self.assertIn(Permission.VIEW, result.granted)
        vc.close()

    def test_wrong_password_rejected(self):
        from peerdesk.viewer import AuthFailed
        vc, t = self._run_host(policy_kwargs={"unattended_password": "letmein"})
        with self.assertRaises(AuthFailed):
            vc.negotiate({Permission.VIEW}, password="wrong")
        vc.close()

    def test_channel_is_encrypted(self):
        vc, t = self._run_host()
        vc.negotiate({Permission.VIEW})
        self.assertTrue(vc.link.encrypted, "session link was not encrypted")
        vc.close()


if __name__ == "__main__":
    unittest.main()
