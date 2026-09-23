# -*- coding: utf-8 -*-
"""Visualize chin hole + try to locate missing mouse belly."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(r"D:\D盘桌面\attic")
SRC = ROOT / "public" / "center-illustration.png"
OUT = ROOT / "assets" / "illu-restore" / "chin-debug.png"

im = Image.open(SRC).convert("RGBA")
w, h = im.size
# crop around mouse lower body
box = (int(w * 0.30), int(h * 0.35), int(w * 0.72), int(h * 0.78))
crop = im.crop(box)
# mark light-gray vs green vs other
vis = crop.copy()
px = vis.load()
cw, ch = vis.size
for y in range(ch):
    for x in range(cw):
        r, g, b, a = px[x, y]
        if a < 40:
            px[x, y] = (255, 0, 255, 255)  # magenta = true transparent
        elif abs(r - 191) < 12 and abs(g - 191) < 12 and abs(b - 191) < 12:
            px[x, y] = (0, 255, 255, 255)  # cyan = face gray
        elif abs(r - 219) < 12 and abs(g - 219) < 12 and abs(b - 219) < 12:
            px[x, y] = (0, 200, 255, 255)  # lighter gray
        elif g > r + 15 and g > b + 5 and g > 80:
            px[x, y] = (255, 0, 0, 180)  # red tint = green meadow/grass/back

OUT.parent.mkdir(parents=True, exist_ok=True)
vis.save(OUT)
print("wrote", OUT, "from box", box)
