# -*- coding: utf-8 -*-
"""Clear only page-bg fringe near the silhouette edge — never punch out interior whites."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(r"D:\D盘桌面\attic")
BACKUP = ROOT / "assets" / "center-illustration.before-defringe.png"
SRC = ROOT / "public" / "center-illustration.png"
TARGETS = [
    SRC,
    ROOT / "public" / "parts" / "center-illustration.png",
    ROOT / "assets" / "cropped" / "center-illustration.png",
    ROOT / "assets" / "full" / "center-illustration.png",
]
BG = (0xDE, 0xE1, 0xF6)
# only strip page ground; keep intentional whites / pale paint inside the art
TOL = 28
EDGE_RING = 6


def near_bg(r: int, g: int, b: int, tol: int = TOL) -> bool:
    return abs(r - BG[0]) + abs(g - BG[1]) + abs(b - BG[2]) <= tol


def main() -> None:
    src = BACKUP if BACKUP.exists() else SRC
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()

    # opaque mask
    opaque = [[px[x, y][3] > 20 for x in range(w)] for y in range(h)]

    # distance-from-transparent via repeated dilation of transparent
    border = [[False] * w for _ in range(h)]
    frontier = []
    for y in range(h):
        for x in range(w):
            if opaque[y][x]:
                edge = False
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if nx < 0 or ny < 0 or nx >= w or ny >= h or not opaque[ny][nx]:
                            edge = True
                            break
                    if edge:
                        break
                if edge:
                    border[y][x] = True
                    frontier.append((x, y))

    ring = [row[:] for row in border]
    cur = frontier
    for _ in range(EDGE_RING - 1):
        nxt = []
        for x, y in cur:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    if opaque[ny][nx] and not ring[ny][nx]:
                        ring[ny][nx] = True
                        nxt.append((nx, ny))
        cur = nxt

    cleared = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                px[x, y] = (r, g, b, 0)
                continue
            # only clear page-bg pixels on the outer ring — leave interior whites
            if ring[y][x] and near_bg(r, g, b):
                px[x, y] = (r, g, b, 0)
                cleared += 1

    for dest in TARGETS:
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest)
        print(f"wrote {dest}")
    print(f"cleared-edge-bg={cleared} (interior whites preserved)")


if __name__ == "__main__":
    main()
