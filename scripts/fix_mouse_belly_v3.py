# -*- coding: utf-8 -*-
"""Paint mouse belly silhouette over grass intrusion under the face."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(r"D:\D盘桌面\attic")
SRC = ROOT / "public" / "center-illustration.png"
TARGETS = [
    SRC,
    ROOT / "public" / "parts" / "center-illustration.png",
    ROOT / "assets" / "cropped" / "center-illustration.png",
    ROOT / "assets" / "full" / "center-illustration.png",
]
FACE = (191, 191, 191, 255)
PREVIEW = ROOT / "assets" / "illu-restore" / "belly-v3-preview.png"


def near(c, t, tol=18):
    return abs(c[0] - t[0]) + abs(c[1] - t[1]) + abs(c[2] - t[2]) <= tol


def is_face(rgb):
    return near(rgb, (191, 191, 191), 22) or near(rgb, (219, 219, 219), 18)


def is_meadow(rgb):
    r, g, b = rgb
    # light green grass / meadow (not olive mouse back)
    return g > 140 and g > r + 12 and g > b + 8 and r < 210


def is_mouse_green(rgb):
    r, g, b = rgb
    # olive/muted green back of mouse
    return 90 < g < 160 and g > r + 8 and abs(r - b) < 40 and r < 140


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()

    face = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 200 and is_face((r, g, b)):
                face.append((x, y))
    fx0 = min(p[0] for p in face)
    fx1 = max(p[0] for p in face)
    fy0 = min(p[1] for p in face)
    fy1 = max(p[1] for p in face)
    # approx head center / radius from face blob
    cx = sum(p[0] for p in face) / len(face)
    cy = sum(p[1] for p in face) / len(face)
    # body is larger round blob — radius from face extent
    rx = (fx1 - fx0) * 0.72
    ry = (fy1 - fy0) * 0.95
    # shift body center slightly down-left so belly covers under chin
    bx = cx - rx * 0.08
    by = cy + ry * 0.35
    brx = rx * 1.15
    bry = ry * 1.25

    print("face", fx0, fy0, fx1, fy1, "body ellipse", bx, by, brx, bry)

    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(
        [bx - brx, by - bry, bx + brx, by + bry],
        fill=255,
    )
    # keep only lower-rightish belly relative to face (don't paint over city)
    for y in range(h):
        for x in range(w):
            if mask.getpixel((x, y)) < 128:
                continue
            # only below mid-face and not deep into top city
            if y < fy0 + (fy1 - fy0) * 0.35:
                mask.putpixel((x, y), 0)
            # don't overwrite left tech / far meadow flowers carelessly:
            # only fill if current pixel is meadow/bg-like or already face
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            rgb = (r, g, b)
            if is_face(rgb) or is_meadow(rgb) or near(rgb, (0xDE, 0xE1, 0xF6), 50):
                continue  # keep mask
            if is_mouse_green(rgb) and y > cy:
                continue  # allow lower mouse-green into belly? skip — keep green back
            # other colors (flowers, buildings): clear mask
            if not is_meadow(rgb) and not is_face(rgb):
                # flowers etc.
                if g > 100 and (b > 150 or r > 150) and not is_meadow(rgb):
                    mask.putpixel((x, y), 0)

    # Soften mask edge
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))

    painted = 0
    for y in range(h):
        for x in range(w):
            m = mask.getpixel((x, y))
            if m < 40:
                continue
            r, g, b, a = px[x, y]
            rgb = (r, g, b)
            # paint meadow / bg / near-white inside belly ellipse
            if (
                a < 40
                or is_meadow(rgb)
                or near(rgb, (0xDE, 0xE1, 0xF6), 50)
                or (r >= 220 and g >= 220 and b >= 220)
            ):
                px[x, y] = FACE
                painted += 1

    print("painted", painted)
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    im.crop((int(w * 0.28), int(h * 0.28), int(w * 0.78), int(h * 0.82))).save(PREVIEW)

    for dest in TARGETS:
        im.save(dest)
        print("wrote", dest)


if __name__ == "__main__":
    main()
