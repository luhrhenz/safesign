#!/usr/bin/env python3
"""
Compose the marketing hero from real screenshots.

Everything here is a genuine capture of the deployed app answering a real
address — nothing is mocked up. Run scripts/screenshots first (or capture by
hand into docs/screenshots), then:

    python3 scripts/hero.py
"""

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin  # noqa: F401

# Pillow's lazy plugin preload imports `subprocess`, which this environment
# blocks. Importing the PNG codec above registers everything we need, so the
# preloaders can safely become no-ops.
Image.preinit = lambda: None
Image.init = lambda: None

import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from icons import write_png  # the hand-rolled PNG encoder; PIL cannot save here

INK = (14, 17, 19)
PAPER = (238, 241, 243)
MUTED = (154, 164, 172)
SAFE = (88, 201, 154)
CAUTION = (224, 170, 90)
DANGER = (255, 138, 128)

PANELS = [
    ("01-danger.png", "A known drainer", "Do not sign", DANGER),
    ("03-caution.png", "The stablecoin you hold", "What this can do", CAUTION),
    ("02-safe.png", "A clean token", "No red flags", SAFE),
    ("05-unsupported.png", "Something it can't check", "Says so plainly", MUTED),
]


def font(size, bold=False):
    for path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if bold else ""),
        "/usr/share/fonts/truetype/liberation/LiberationSans%s.ttf" % ("-Bold" if bold else "-Regular"),
    ]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def rounded(img, radius):
    """Round the phone corners so the panels read as screens, not rectangles."""
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius, fill=255)
    out = Image.new("RGB", img.size, INK)
    out.paste(img, (0, 0), mask)
    return out


def build():
    # Crop the browser scrollbar off the right edge — it reads as a rendering
    # artefact in a marketing image, and the cards have margin to spare.
    SCROLLBAR = 15
    shots = []
    for name, *_ in PANELS:
        img = Image.open(f"docs/screenshots/{name}")
        shots.append(img.crop((0, 0, img.size[0] - SCROLLBAR, img.size[1])))
    sw, sh = shots[0].size
    scale = 0.62
    pw, ph = int(sw * scale), int(sh * scale)

    gap, margin, top = 40, 64, 210
    width = margin * 2 + pw * len(shots) + gap * (len(shots) - 1)
    height = top + ph + 150

    canvas = Image.new("RGB", (width, height), INK)
    draw = ImageDraw.Draw(canvas)

    draw.text((margin, 62), "Is this safe to sign?", font=font(58, True), fill=PAPER)
    draw.text(
        (margin, 136),
        "Paste a token, a contract or a link. Real answers from the deployed app — not mockups.",
        font=font(25), fill=MUTED,
    )

    for i, (shot, (_, caption, verdict, colour)) in enumerate(zip(shots, PANELS)):
        x = margin + i * (pw + gap)
        panel = rounded(shot.resize((pw, ph), Image.LANCZOS), 26)
        canvas.paste(panel, (x, top))

        # A rule in the verdict's own colour, tying caption to screen.
        draw.rectangle([x, top + ph + 26, x + 54, top + ph + 30], fill=colour)
        draw.text((x, top + ph + 48), verdict, font=font(27, True), fill=colour)
        draw.text((x, top + ph + 86), caption, font=font(22), fill=MUTED)

    write_png("docs/screenshots/hero.png", canvas)
    print(f"  docs/screenshots/hero.png  {width}x{height}")


if __name__ == "__main__":
    build()
