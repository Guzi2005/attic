# -*- coding: utf-8 -*-
"""Second pass: mop up remaining page-bg pixels under the mouse belly."""
from pathlib import Path

from PIL import Image

ROOT = Path(r"D:\D盘桌面\attic")
SRC = ROOT / "public" / "center-illustration.png"
TARGETS = [
    SRC,
    ROOT / "public" / "parts" / "center-illustration.png",
    ROOT / "assets" / "cropped" / "center-illustration.png",
    ROOT / "assets" / "full" / "center-illustration.png",
    ROOT / "assets" / "center-illustration.before-defringe.png",
]
BG = (0xDE, 0xE1, 0xF6)
FACE = (191, 191, 191, 255)


def near(c, t, tol):
    return abs(c[0] - t[0]) + abs(c[1] - t[1]) + abs(c[2] - t[2]) <= tol


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()
    fixed = 0
    # wider belly band
    for y in range(int(h * 0.48), int(h * 0.78)):
        for x in range(int(w * 0.38), int(w * 0.72)):
            r, g, b, a = px[x, y]
            if a < 40 or near((r, g, b), BG, 48) or (r >= 228 and g >= 228 and b >= 235 and b >= r - 5):
                # only if near face-gray or already-fixed belly (avoid eating sky)
                neigh = 0
                for dy in (-2, -1, 0, 1, 2):
                    for dx in (-2, -1, 0, 1, 2):
                        nx, ny = x + dx, y + dy
                        if not (0 <= nx < w and 0 <= ny < h):
                            continue
                        rr, gg, bb, aa = px[nx, ny]
                        if aa > 200 and near((rr, gg, bb), (191, 191, 191), 22):
                            neigh += 1
                if neigh >= 3:
                    px[x, y] = FACE
                    fixed += 1
    print("mopped", fixed)
    for dest in TARGETS:
        im.save(dest)
        print("wrote", dest.name)


if __name__ == "__main__":
    main()
