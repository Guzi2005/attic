# -*- coding: utf-8 -*-
"""Find page-bg / near-white keyed pixels in mouse belly and fill with face gray."""
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
BG = (0xDE, 0xE1, 0xF6)
FACE = (191, 191, 191, 255)
PREVIEW = ROOT / "assets" / "illu-restore" / "belly-fixed-preview.png"


def near(c, t, tol):
    return abs(c[0] - t[0]) + abs(c[1] - t[1]) + abs(c[2] - t[2]) <= tol


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()

    # 1) locate face gray seed (right of center)
    face_pts = []
    for y in range(int(h * 0.32), int(h * 0.55)):
        for x in range(int(w * 0.48), int(w * 0.70)):
            r, g, b, a = px[x, y]
            if a > 200 and near((r, g, b), (191, 191, 191), 18):
                face_pts.append((x, y))
    if not face_pts:
        raise SystemExit("no face gray found")
    # face bbox
    fx0 = min(p[0] for p in face_pts)
    fx1 = max(p[0] for p in face_pts)
    fy0 = min(p[1] for p in face_pts)
    fy1 = max(p[1] for p in face_pts)
    print("face bbox", fx0, fy0, fx1, fy1, "n", len(face_pts))

    # 2) belly search band: below face, roughly under mouse
    bx0 = fx0 - 30
    bx1 = fx1 + 10
    by0 = fy1 - 10
    by1 = min(h - 1, fy1 + int((fy1 - fy0) * 1.35))

    # candidates: page-bg colored OR very pale lavender/white that aren't face
    hole = []
    for y in range(by0, by1):
        for x in range(max(0, bx0), min(w, bx1)):
            r, g, b, a = px[x, y]
            if a < 40:
                hole.append((x, y))
                continue
            # page ground / keyed white → lavender
            if near((r, g, b), BG, 36):
                hole.append((x, y))
                continue
            # near-white that isn't face gray (defensive)
            if r >= 230 and g >= 230 and b >= 230:
                hole.append((x, y))

    print("hole candidates", len(hole), "band", bx0, by0, bx1, by1)

    # 3) also grab green meadow pixels that sit in a concavity under face
    #    (keyed white was healed into grass neighbors in some pipelines)
    # Prefer: connected region of BG-like under face, expand slightly into
    # flat green that's surrounded by face/green-back silhouette.

    # Grow hole into adjacent BG-like and into "floating" grass pockets
    # under the chin that are enclosed by silhouette.
    hole_set = set(hole)
    # expand within band to include more BG-like
    q = deque(hole)
    while q:
        x, y = q.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if nx < bx0 or ny < by0 or nx >= bx1 or ny >= by1:
                    continue
                if (nx, ny) in hole_set:
                    continue
                r, g, b, a = px[nx, ny]
                if a < 40 or near((r, g, b), BG, 42) or (r >= 225 and g >= 225 and b >= 225):
                    hole_set.add((nx, ny))
                    q.append((nx, ny))

    print("hole after grow", len(hole_set))

    # If still too few, detect BG strip by scanning rows under face for BG ratio
    if len(hole_set) < 80:
        for y in range(fy1, min(h, fy1 + 120)):
            row = []
            for x in range(max(0, fx0 - 20), min(w, fx1 + 5)):
                r, g, b, a = px[x, y]
                if a < 40 or near((r, g, b), BG, 40):
                    row.append((x, y))
            if len(row) >= 8:
                for p in row:
                    hole_set.add(p)
        print("hole after row scan", len(hole_set))

    # 4) paint belly with face gray + slight noise from neighbors
    for x, y in hole_set:
        px[x, y] = FACE

    # 5) light morphological close: fill 1px gaps at belly edge with FACE
    # if majority of neighbors are face gray or green-back
    cur = im.copy()
    cp = cur.load()
    for y in range(by0, by1):
        for x in range(max(0, bx0), min(w, bx1)):
            r, g, b, a = cp[x, y]
            if a > 200 and not near((r, g, b), BG, 30):
                continue
            face_n = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    rr, gg, bb, aa = cp[x + dx, y + dy] if 0 <= x + dx < w and 0 <= y + dy < h else (0, 0, 0, 0)
                    if aa > 200 and near((rr, gg, bb), (191, 191, 191), 20):
                        face_n += 1
            if face_n >= 4:
                px[x, y] = FACE

    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    # preview crop
    prev = im.crop((int(w * 0.28), int(h * 0.28), int(w * 0.75), int(h * 0.78)))
    prev.save(PREVIEW)
    print("preview", PREVIEW)

    for dest in TARGETS:
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest)
        print("wrote", dest)


if __name__ == "__main__":
    main()
