# -*- coding: utf-8 -*-
"""Remap pattern paper bg to cover lavender + export seamless tile."""
from pathlib import Path
from PIL import Image

ROOT = Path(r"D:\D盘桌面\attic")
SRC = ROOT / "public" / "parts" / "cover-pattern-ref.png"
OUT = ROOT / "public" / "parts" / "cover-void-pattern.png"
BG = (0xDE, 0xE1, 0xF6)

im = Image.open(SRC).convert("RGBA")
w, h = im.size
px = im.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        # near-white / paper → cover bg
        if r > 210 and g > 210 and b > 210:
            px[x, y] = (*BG, 255)
        elif abs(r - g) < 18 and abs(g - b) < 18 and r > 180:
            t = (r - 180) / 75
            px[x, y] = (
                int(r * (1 - t) + BG[0] * t),
                int(g * (1 - t) + BG[1] * t),
                int(b * (1 - t) + BG[2] * t),
                255,
            )

# crop to even square for cleaner tiling
side = min(w, h)
im = im.crop((0, 0, side, side))
im.save(OUT, optimize=True)
print("wrote", OUT, im.size)
