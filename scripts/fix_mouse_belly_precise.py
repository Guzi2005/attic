# -*- coding: utf-8 -*-
"""Precisely restore mouse belly: paint face-gray over grass under the chin only."""
from __future__ import annotations

from collections import deque
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
BG = (0xDE, 0xE1, 0xF6)
PREVIEW = ROOT / "assets" / "illu-restore" / "belly-precise-preview.png"


def near(c, t, tol):
    return abs(c[0] - t[0]) + abs(c[1] - t[1]) + abs(c[2] - t[2]) <= tol


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()

    # seed: known face area from earlier inspection
    seeds = []
    for y in range(int(h * 0.34), int(h * 0.52)):
        for x in range(int(w * 0.50), int(w * 0.68)):
            r, g, b, a = px[x, y]
            if a > 200 and near((r, g, b), (191, 191, 191), 16):
                seeds.append((x, y))
    if not seeds:
        raise SystemExit("no face seed")

    # flood face gray CC
    face = set()
    q = deque(seeds[:200])
    for s in seeds[:200]:
        face.add(s)
    while q:
        x, y = q.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h) or (nx, ny) in face:
                    continue
                r, g, b, a = px[nx, ny]
                if a > 200 and near((r, g, b), (191, 191, 191), 20):
                    face.add((nx, ny))
                    q.append((nx, ny))

    fx0 = min(p[0] for p in face)
    fx1 = max(p[0] for p in face)
    fy0 = min(p[1] for p in face)
    fy1 = max(p[1] for p in face)
    print("face CC", len(face), "bbox", fx0, fy0, fx1, fy1)

    # belly ellipse tucked under chin
    cx = (fx0 + fx1) / 2
    cy = fy1 - (fy1 - fy0) * 0.05
    brx = (fx1 - fx0) * 0.55
    bry = (fy1 - fy0) * 0.55

    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([cx - brx, cy - bry * 0.15, cx + brx * 1.05, cy + bry * 1.35], fill=255)
    # clip mask to below mid-face
    for y in range(0, int(fy0 + (fy1 - fy0) * 0.45)):
        for x in range(w):
            if mask.getpixel((x, y)):
                mask.putpixel((x, y), 0)

    mask = mask.filter(ImageFilter.GaussianBlur(1.2))

    painted = 0
    for y in range(h):
        for x in range(w):
            if mask.getpixel((x, y)) < 90:
                continue
            r, g, b, a = px[x, y]
            if a < 40:
                px[x, y] = FACE
                painted += 1
                continue
            # meadow / grass
            if g > 145 and g > r + 10 and g > b + 5 and r < 215:
                px[x, y] = FACE
                painted += 1
                continue
            # page bg / keyed white
            if near((r, g, b), BG, 45) or (r >= 225 and g >= 225 and b >= 230):
                px[x, y] = FACE
                painted += 1

    print("painted", painted, "ellipse", cx, cy, brx, bry)
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    im.crop((int(w * 0.30), int(h * 0.30), int(w * 0.78), int(h * 0.82))).save(PREVIEW)

    for dest in TARGETS:
        im.save(dest)
        print("wrote", dest.name)


if __name__ == "__main__":
    main()
