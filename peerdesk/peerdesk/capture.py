"""Screen capture and frame encoding.

The streaming model is deliberately simple and dependency-light (think "VNC
with JPEG tiles"): grab the screen, cut it into a grid of tiles, and only send
the tiles whose contents changed since the previous frame.  This keeps
bandwidth proportional to on-screen motion without pulling in a full video
codec.

``ScreenGrabber`` prefers the ``mss`` library and falls back to Pillow's
``ImageGrab`` (available on Windows/macOS).  Neither is importable in a
headless CI box, so the imports are deferred and the tile-diffing logic
(``TileEncoder``) works on any Pillow image and is unit-tested directly.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from typing import List, Optional, Tuple

DEFAULT_TILE = 128
DEFAULT_QUALITY = 60


@dataclass
class Tile:
    x: int
    y: int
    w: int
    h: int
    data: bytes          # JPEG-encoded bytes for this tile

    def meta(self, seq: int) -> dict:
        return {"x": self.x, "y": self.y, "w": self.w, "h": self.h, "seq": seq}


class TileEncoder:
    """Turns successive full-screen Pillow images into lists of changed tiles."""

    def __init__(self, tile: int = DEFAULT_TILE, quality: int = DEFAULT_QUALITY):
        self.tile = tile
        self.quality = quality
        self._hashes: dict = {}
        self._size: Optional[Tuple[int, int]] = None

    def reset(self) -> None:
        self._hashes.clear()
        self._size = None

    def encode(self, image) -> List[Tile]:
        """Return the tiles that changed since the previous call.

        The first call (or any call after a size change) returns every tile.
        """
        from PIL import Image  # local import: Pillow is a runtime dependency

        if image.mode != "RGB":
            image = image.convert("RGB")
        width, height = image.size
        if self._size != (width, height):
            # Resolution changed -> everything is "new".
            self._hashes.clear()
            self._size = (width, height)

        changed: List[Tile] = []
        for top in range(0, height, self.tile):
            for left in range(0, width, self.tile):
                right = min(left + self.tile, width)
                bottom = min(top + self.tile, height)
                box = (left, top, right, bottom)
                region = image.crop(box)
                digest = hashlib.blake2b(region.tobytes(), digest_size=16).digest()
                key = (left, top)
                if self._hashes.get(key) == digest:
                    continue
                self._hashes[key] = digest
                changed.append(Tile(
                    x=left, y=top, w=right - left, h=bottom - top,
                    data=_jpeg_bytes(region, self.quality),
                ))
        return changed

    def screen_size(self) -> Tuple[int, int]:
        return self._size or (0, 0)


def _jpeg_bytes(image, quality: int) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


class ScreenGrabber:
    """Grabs the primary screen as a Pillow image using the best backend."""

    def __init__(self):
        self._backend = None
        self._mss = None

    def _ensure_backend(self):
        if self._backend is not None:
            return
        try:
            import mss  # type: ignore
            self._mss = mss.mss()
            self._backend = "mss"
            return
        except Exception:
            pass
        try:
            from PIL import ImageGrab  # type: ignore
            _ = ImageGrab  # noqa: F841
            self._backend = "pil"
            return
        except Exception as exc:  # pragma: no cover - platform dependent
            raise RuntimeError(
                "No screen-capture backend available. Install 'mss' "
                "(pip install mss) or run on a platform with Pillow's "
                "ImageGrab support.") from exc

    def grab(self):
        from PIL import Image
        self._ensure_backend()
        if self._backend == "mss":
            monitor = self._mss.monitors[1]  # primary monitor
            shot = self._mss.grab(monitor)
            return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        from PIL import ImageGrab
        return ImageGrab.grab()


class ScreenFrameSource:
    """Combines a grabber and a tile encoder into the interface the host wants."""

    def __init__(self, grabber: Optional[ScreenGrabber] = None,
                 tile: int = DEFAULT_TILE, quality: int = DEFAULT_QUALITY):
        self._grabber = grabber or ScreenGrabber()
        self._encoder = TileEncoder(tile=tile, quality=quality)
        self._size = (0, 0)

    def screen_size(self) -> Tuple[int, int]:
        if self._size == (0, 0):
            img = self._grabber.grab()
            self._size = img.size
        return self._size

    def next_tiles(self) -> List[Tile]:
        img = self._grabber.grab()
        self._size = img.size
        return self._encoder.encode(img)


class StaticFrameSource:
    """A deterministic frame source for tests and demos (no real screen)."""

    def __init__(self, size=(320, 240), color=(10, 120, 200),
                 tile: int = DEFAULT_TILE, quality: int = DEFAULT_QUALITY):
        self._size = size
        self._color = color
        self._encoder = TileEncoder(tile=tile, quality=quality)
        self._emitted = False

    def screen_size(self) -> Tuple[int, int]:
        return self._size

    def next_tiles(self) -> List[Tile]:
        from PIL import Image
        if self._emitted:
            return []  # nothing changed after the first frame
        self._emitted = True
        img = Image.new("RGB", self._size, self._color)
        return self._encoder.encode(img)
