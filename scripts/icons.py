#!/usr/bin/env python3
"""
Generate the app icons from the same mark the interface uses.

The shield-with-a-scan-line in components/icons.tsx is drawn on a 24x24 grid;
this reproduces those exact coordinates at any size so the home-screen icon and
the wordmark cannot drift apart.

    python3 scripts/icons.py
"""

import struct
import zlib

from PIL import Image, ImageDraw

INK = (20, 23, 26)        # --ink
PAPER = (245, 246, 248)   # --paper

# The shield path from icons.tsx: M12 3 L5 6 V12 C..12 21..19 12 V6 Z
def cubic(p0, p1, p2, p3, steps=24):
    out = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        out.append((
            u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
        ))
    return out


def shield_points():
    pts = [(12, 3), (5, 6), (5, 12)]
    pts += cubic((5, 12), (5, 16), (8, 19), (12, 21))
    pts += cubic((12, 21), (16, 19), (19, 16), (19, 12))
    pts += [(19, 6)]
    return pts


def render(size: int, inset: float) -> Image.Image:
    """`inset` is the share of the canvas left as padding — maskable icons need
    their content inside the middle 80% or a launcher will crop it."""
    scale = 8  # supersample, then downscale: cheap antialiasing
    canvas = size * scale
    img = Image.new("RGB", (canvas, canvas), INK)
    draw = ImageDraw.Draw(img)

    art = canvas * (1 - 2 * inset)
    unit = art / 24
    offset = canvas * inset

    def place(p):
        return (offset + p[0] * unit, offset + p[1] * unit)

    width = max(2, int(1.75 * unit))
    # Carry on past the closing point so the apex is drawn as an interior
    # joint; ending the stroke there leaves a notch in the point of the shield.
    path = [place(p) for p in shield_points()] + [place((12, 3)), place((5, 6))]
    draw.line(path, fill=PAPER, width=width, joint="curve")
    # the scan line through it
    draw.line([place((8, 12)), place((16, 12))], fill=PAPER, width=width)

    return img.resize((size, size), Image.LANCZOS)


def write_png(path: str, img: Image.Image) -> None:
    """
    Encode the PNG by hand.

    Pillow can draw here but not save: its save path preloads every image
    plugin, one of which imports `subprocess`, which this environment blocks.
    Writing the four chunks ourselves needs nothing but zlib.
    """
    width, height = img.size
    pixels = img.convert("RGB").tobytes()
    stride = width * 3

    # Each scanline is prefixed with its filter type; 0 means "none".
    raw = b"".join(
        b"\x00" + pixels[y * stride : (y + 1) * stride] for y in range(height)
    )

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")

    with open(path, "wb") as handle:
        handle.write(png)


if __name__ == "__main__":
    targets = [
        ("public/icon-192.png", 192, 0.14),
        ("public/icon-512.png", 512, 0.14),
        # Maskable: more padding, because launchers crop to a circle or squircle.
        ("public/icon-maskable-512.png", 512, 0.22),
        ("public/apple-touch-icon.png", 180, 0.14),
        ("public/favicon.png", 48, 0.10),
    ]
    for path, size, inset in targets:
        write_png(path, render(size, inset))
        print(f"  {path}  {size}x{size}")
