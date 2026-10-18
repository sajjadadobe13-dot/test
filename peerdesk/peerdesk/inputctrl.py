"""Remote input injection.

Input events travel from the viewer to the host as small JSON dicts, e.g.::

    {"type": "mouse_move", "x": 0.42, "y": 0.75}
    {"type": "mouse_down", "button": "left"}
    {"type": "key", "action": "down", "key": "a"}

Coordinates are normalised to 0..1 so they are resolution-independent; the host
scales them to its own screen.  ``SystemInputController`` drives the real mouse
and keyboard via ``pynput`` (imported lazily), while ``RecordingInputSink``
captures events for tests.

Every event the host applies has already passed the CONTROL-permission check in
``host.py`` -- this module never decides policy, it only executes.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

MOUSE_MOVE = "mouse_move"
MOUSE_DOWN = "mouse_down"
MOUSE_UP = "mouse_up"
SCROLL = "scroll"
KEY = "key"


class InputSink:
    """Interface the host calls to apply a single remote input event."""

    def apply(self, event: Dict) -> None:  # pragma: no cover - interface
        raise NotImplementedError

    def screen_size(self) -> Tuple[int, int]:  # pragma: no cover - interface
        raise NotImplementedError


class RecordingInputSink(InputSink):
    """Stores events instead of performing them -- used in tests and headless."""

    def __init__(self, size: Tuple[int, int] = (1920, 1080)):
        self.events: List[Dict] = []
        self._size = size

    def apply(self, event: Dict) -> None:
        self.events.append(dict(event))

    def screen_size(self) -> Tuple[int, int]:
        return self._size


class SystemInputController(InputSink):
    """Drives the real mouse and keyboard with pynput."""

    def __init__(self, size: Optional[Tuple[int, int]] = None):
        self._size = size
        self._mouse = None
        self._kbd = None
        self._Button = None
        self._Key = None
        self._KeyCode = None

    def _ensure(self):
        if self._mouse is not None:
            return
        try:
            from pynput.mouse import Button, Controller as MouseController
            from pynput.keyboard import (
                Controller as KeyController,
                Key,
                KeyCode,
            )
        except Exception as exc:  # pragma: no cover - platform dependent
            raise RuntimeError(
                "pynput is required for remote control "
                "(pip install pynput).") from exc
        self._mouse = MouseController()
        self._kbd = KeyController()
        self._Button = Button
        self._Key = Key
        self._KeyCode = KeyCode

    def screen_size(self) -> Tuple[int, int]:
        if self._size:
            return self._size
        try:
            from PIL import ImageGrab
            self._size = ImageGrab.grab().size
        except Exception:  # pragma: no cover - platform dependent
            self._size = (1920, 1080)
        return self._size

    def apply(self, event: Dict) -> None:
        self._ensure()
        etype = event.get("type")
        if etype == MOUSE_MOVE:
            self._mouse.position = self._to_pixels(event)
        elif etype == MOUSE_DOWN:
            self._mouse.position = self._to_pixels(event)
            self._mouse.press(self._button(event.get("button", "left")))
        elif etype == MOUSE_UP:
            self._mouse.release(self._button(event.get("button", "left")))
        elif etype == SCROLL:
            self._mouse.scroll(int(event.get("dx", 0)), int(event.get("dy", 0)))
        elif etype == KEY:
            self._key(event)

    # -- helpers ------------------------------------------------------------
    def _to_pixels(self, event: Dict) -> Tuple[int, int]:
        w, h = self.screen_size()
        x = event.get("x")
        y = event.get("y")
        if x is None or y is None:
            return self._mouse.position
        return int(float(x) * w), int(float(y) * h)

    def _button(self, name: str):
        return getattr(self._Button, name, self._Button.left)

    def _key(self, event: Dict):
        action = event.get("action", "press")
        name = event.get("key", "")
        key = self._resolve_key(name)
        if action == "down":
            self._kbd.press(key)
        elif action == "up":
            self._kbd.release(key)
        else:
            self._kbd.press(key)
            self._kbd.release(key)

    def _resolve_key(self, name: str):
        if len(name) == 1:
            return name
        special = getattr(self._Key, name, None)
        if special is not None:
            return special
        return self._KeyCode.from_char(name[0]) if name else " "
