# -*- coding: utf-8 -*-
from collections import Counter
from pathlib import Path

from PIL import Image

ROOT = Path(r"D:\D盘桌面\attic")
paths = [
    ROOT / "public" / "center-illustration.png",
    ROOT / "assets" / "center-illustration.before-defringe.png",
    ROOT / "assets" / "named" / "center-illustration.png",
    ROOT / "assets" / "cropped" / "center-illustration.png",
]


def analyze(path: Path) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    x0, x1 = int(w * 0.35), int(w * 0.65)
    y0, y1 = int(h * 0.45), int(h * 0.75)
    tr = op = 0
    cols: Counter[int] = Counter()
    holes = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a < 40:
                tr += 1
                if len(holes) < 12:
                    holes.append((x, y, a))
            else:
                op += 1
                if abs(r - g) < 12 and abs(g - b) < 12:
                    cols[r] += 1
    print(path.name, "size", w, h, "zone transparent", tr, "opaque", op)
    print("  gray", cols.most_common(8))
    print("  holes", holes[:8])


for p in paths:
    if p.exists():
        analyze(p)
    else:
        print("missing", p)
