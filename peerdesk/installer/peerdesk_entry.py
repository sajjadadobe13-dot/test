"""PyInstaller entry point.

PyInstaller freezes a script, not a package, so this thin wrapper simply hands
control to the real CLI in :mod:`peerdesk.__main__`.
"""

import sys

from peerdesk.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
