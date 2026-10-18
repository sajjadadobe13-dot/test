"""Generate a simple, original PeerDesk .ico file with Pillow.

Usage:  python installer/make_icon.py [output.ico]

The mark is two overlapping rounded "screens" linked by a connector dot -- an
original design, drawn entirely in code.
"""

import sys

from PIL import Image, ImageDraw


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def render(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 256.0
    bg = (24, 28, 38, 255)
    accent = (46, 134, 222, 255)      # blue
    accent2 = (64, 196, 160, 255)     # teal
    light = (236, 240, 245, 255)

    rounded(d, [8 * s, 8 * s, 248 * s, 248 * s], 48 * s, bg)
    # back screen
    rounded(d, [52 * s, 60 * s, 160 * s, 150 * s], 14 * s, accent)
    rounded(d, [62 * s, 70 * s, 150 * s, 140 * s], 8 * s, light)
    # front screen (overlapping)
    rounded(d, [104 * s, 104 * s, 212 * s, 194 * s], 14 * s, accent2)
    rounded(d, [114 * s, 114 * s, 202 * s, 184 * s], 8 * s, light)
    # connector dot
    d.ellipse([150 * s, 150 * s, 168 * s, 168 * s], fill=bg)
    return img


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "peerdesk.ico"
    sizes = [16, 24, 32, 48, 64, 128, 256]
    base = render(256)
    images = [base.resize((n, n), Image.LANCZOS) for n in sizes]
    base.save(out, format="ICO", sizes=[(n, n) for n in sizes])
    print(f"wrote {out} ({', '.join(str(n) for n in sizes)} px)")


if __name__ == "__main__":
    main()
