"""Verify a complete session can be established through the rendezvous relay."""

import tempfile
import threading
import time
import unittest

from peerdesk.capture import StaticFrameSource
from peerdesk.host import HostContext, serve_connection
from peerdesk.inputctrl import RecordingInputSink
from peerdesk.relay import RelayServer, connect_viewer, register_host
from peerdesk.sessions import HostPolicy, Permission
from peerdesk.viewer import ViewerClient


def _free_port():
    import socket
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class RelayTests(unittest.TestCase):
    def test_session_through_relay(self):
        port = _free_port()
        relay = RelayServer(host="127.0.0.1", port=port)
        threading.Thread(target=relay.start, daemon=True).start()
        self.addCleanup(relay.stop)
        time.sleep(0.2)  # let the relay bind

        device_id = "900123456"
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)

        # Host thread: register with the relay, then serve once paired.
        def run_host():
            link = register_host("127.0.0.1", port, device_id)
            ctx = HostContext(
                device_id=device_id,
                device_name="Relayed Host",
                policy=HostPolicy(),
                consent_provider=lambda s: set(s.requested),
                download_dir=tmp.name,
                frame_source_factory=lambda: StaticFrameSource(size=(160, 120)),
                input_sink=RecordingInputSink(size=(160, 120)),
            )
            serve_connection(link, ctx, "relayed")

        ht = threading.Thread(target=run_host, daemon=True)
        ht.start()
        time.sleep(0.2)  # let the host register before the viewer connects

        link = connect_viewer("127.0.0.1", port, device_id)
        vc = ViewerClient(name="Relay Tester")
        vc.attach_link(link)
        result = vc.negotiate({Permission.VIEW, Permission.CONTROL})
        self.assertIn(Permission.CONTROL, result.granted)
        self.assertEqual(result.host_id, device_id)
        self.assertTrue(vc.link.encrypted)
        vc.close()


if __name__ == "__main__":
    unittest.main()
