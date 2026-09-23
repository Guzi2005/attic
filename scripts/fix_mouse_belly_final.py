# -*- coding: utf-8 -*-
"""Final belly fill: cover remaining meadow under chin with face gray."""
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
PREVIEW = ROOT / "assets" / "illu-restore" / "belly-final-preview.png"


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()

    # tight belly under face (from measured face ~486-694 x, 335-538 y originally;
    # after fills face extends lower)
    # Cover the V notch: center under whiskers
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    # polygon approximating round belly under chin
    d.ellipse([500, 560, 720, 760], fill=255)
    d.polygon([(520, 540), (700, 540), (710, 650), (620, 760), (510, 650)], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.5))

    painted = 0
    for y in range(530, 780):
        for x in range(480, 740):
            if mask.getpixel((x, y)) < 100:
                continue
            r, g, b, a = px[x, y]
            meadow = g > 150 and g > r + 8 and g > b + 4 and r < 220
            bgish = abs(r - 0xDE) + abs(g - 0xE1) + abs(b - 0xF6) <= 50
            pale = r >= 210 and g >= 210 and b >= 210
            # don't paint distinctive flowers (high blue or magenta)
            flower = (b > g + 25 and b > 140) or (r > 160 and b > 140 and g < 140)
            if flower:
                continue
            if a < 40 or meadow or bgish or pale:
                px[x, y] = FACE
                painted += 1

    print("painted", painted)
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    im.crop((300, 300, 780, 820)).save(PREVIEW)
    for t in TARGETS:
        im.save(t)
        print("wrote", t.name)


if __name__ == "__main__":
    main()
