# -*- coding: utf-8 -*-
"""Crop major quilt tiles for homepage bento mock."""
from pathlib import Path
from PIL import Image

ROOT = Path(r"D:\D盘桌面\attic")
SRC = ROOT / "public" / "home-quilt-mock.png"
OUT = ROOT / "public" / "parts" / "bento"
OUT.mkdir(parents=True, exist_ok=True)

# hand-tuned boxes on 1024² reference (x0,y0,x1,y1)
CROPS = {
    "banner": (8, 8, 1016, 198),
    "pear": (14, 205, 128, 488),
    "cow-brown": (132, 205, 418, 348),
    "sheep": (422, 205, 698, 348),
    "corn": (828, 205, 958, 520),
    "star": (200, 352, 418, 568),
    "flower-blue": (700, 352, 820, 560),
    "flower-pink": (830, 360, 1010, 560),
    "tomatoes": (14, 620, 200, 820),
    "cow-green": (280, 575, 640, 730),
    "rabbit": (700, 575, 1010, 760),
    "bird": (830, 205, 1010, 350),
}

im = Image.open(SRC).convert("RGBA")
for name, (x0, y0, x1, y1) in CROPS.items():
    tile = im.crop((x0, y0, x1, y1))
    path = OUT / f"{name}.png"
    tile.save(path)
    print(name, tile.size, "->", path.name)
