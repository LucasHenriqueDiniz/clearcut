"""Turn the master artwork in icon.png into the app's icon set.

The source is a squircle rendered onto a white canvas with a drop shadow. The
white and the shadow are canvas, not artwork: everything here trims to the
squircle's own bounds and rebuilds the alpha geometrically, so the edge is
clean at 16px instead of carrying a grey fringe.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "icon.png"
PUBLIC = ROOT / "frontend" / "public"

MASTER = 1024
# Windows 11 and macOS both sit near a fifth of the width; the source artwork
# measures ~21%, so masking at 20% shaves the corner instead of leaving white.
CORNER_RATIO = 0.20
SUPERSAMPLE = 4
EDGE_INSET = 6

PNG_SIZES = {
    "icon.png": 1024,
    "android-chrome-512x512.png": 512,
    "android-chrome-192x192.png": 192,
    "apple-touch-icon.png": 180,
    "favicon-32x32.png": 32,
    "favicon-16x16.png": 16,
}
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def artwork_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    """Bounds of the squircle, ignoring the white canvas and the grey shadow.

    The shadow is desaturated and light; the artwork is either saturated or
    dark, so those two tests together separate them without a hand-tuned box.
    """
    rgb = np.asarray(image.convert("RGB")).astype(int)
    saturation = rgb.max(2) - rgb.min(2)
    art = (saturation > 40) | (rgb.max(2) < 180)
    ys, xs = np.nonzero(art)
    if not len(xs):
        raise SystemExit("no artwork found in the source image")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def square_crop(image: Image.Image) -> Image.Image:
    left, top, right, bottom = artwork_bounds(image)
    side = max(right - left, bottom - top)
    # Drop the outermost ring: it is the source squircle anti-aliased against
    # white, and keeping it leaves a pale fringe that reads as a halo once the
    # icon is composited on a dark taskbar.
    side -= 2 * EDGE_INSET
    cx, cy = (left + right) // 2, (top + bottom) // 2
    half = side // 2
    return image.convert("RGB").crop((cx - half, cy - half, cx - half + side, cy - half + side))


def squircle_alpha(size: int) -> Image.Image:
    """Anti-aliased rounded-square mask, drawn large and downsampled."""
    big = size * SUPERSAMPLE
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, big - 1, big - 1), radius=int(big * CORNER_RATIO), fill=255
    )
    return mask.resize((size, size), Image.LANCZOS)


def build_master() -> Image.Image:
    source = Image.open(SOURCE)
    art = square_crop(source).resize((MASTER, MASTER), Image.LANCZOS)
    art.putalpha(squircle_alpha(MASTER))
    return art


def main() -> int:
    master = build_master()
    PUBLIC.mkdir(parents=True, exist_ok=True)

    for name, size in PNG_SIZES.items():
        out = master if size == MASTER else master.resize((size, size), Image.LANCZOS)
        out.save(PUBLIC / name)
        print(f"{name}: {size}x{size}")

    for name in ("icon.ico", "favicon.ico"):
        master.save(PUBLIC / name, sizes=[(s, s) for s in ICO_SIZES])
        print(f"{name}: {ICO_SIZES}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
