# -*- coding: utf-8 -*-
"""Knock out pale fringe and heal seam whites on center-illustration."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(r"D:\D盘桌面\attic")
SRC = ROOT / "public" / "center-illustration.png"
BACKUP = ROOT / "assets" / "center-illustration.before-defringe.png"
ALSO = [
    ROOT / "assets" / "cropped" / "center-illustration.png",
    ROOT / "assets" / "full" / "center-illustration.png",
]
BG = (0xDE, 0xE1, 0xF6)


def near_bg(r: int, g: int, b: int, tol: int = 36) -> bool:
    return abs(r - BG[0]) + abs(g - BG[1]) + abs(b - BG[2]) <= tol


def is_pale(r: int, g: int, b: int, a: int) -> bool:
    if a < 40:
        return True
    if near_bg(r, g, b, 40):
        return True
    return r >= 208 and g >= 208 and b >= 220


def main() -> None:
    src = BACKUP if BACKUP.exists() else SRC
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 200 and (near_bg(r, g, b, 45) or (r >= 212 and g >= 212 and b >= 228)):
                px[x, y] = (r, g, b, 0)
            elif a < 255 and near_bg(r, g, b, 28):
                px[x, y] = (r, g, b, 0)

    for _ in range(2):
        cur = im.copy()
        cp = cur.load()
        npx = im.load()
        for y in range(h):
            for x in range(w):
                r, g, b, a = cp[x, y]
                if a > 200:
                    continue
                best_a = 0
                best = None
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if nx < 0 or ny < 0 or nx >= w or ny >= h:
                            continue
                        rr, gg, bb, aa = cp[nx, ny]
                        if aa > best_a and aa > 200 and not near_bg(rr, gg, bb, 30):
                            best_a = aa
                            best = (rr, gg, bb)
                if best is not None:
                    npx[x, y] = (best[0], best[1], best[2], 255)

    px = im.load()
    cur = im.copy()
    cp = cur.load()
    healed = 0
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = cp[x, y]
            if a < 180 or not is_pale(r, g, b, a):
                continue
            cols = []
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    rr, gg, bb, aa = cp[x + dx, y + dy]
                    if aa > 200 and not is_pale(rr, gg, bb, aa):
                        cols.append((rr, gg, bb))
            if len(cols) >= 3:
                rr = sum(c[0] for c in cols) // len(cols)
                gg = sum(c[1] for c in cols) // len(cols)
                bb = sum(c[2] for c in cols) // len(cols)
                px[x, y] = (rr, gg, bb, 255)
                healed += 1

    im.save(SRC)
    print(f"healed {healed} seam pixels → {SRC}")
    for p in ALSO:
        if p.exists():
            im.save(p)
            print(f"wrote {p}")


if __name__ == "__main__":
    main()
