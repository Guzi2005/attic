# -*- coding: utf-8 -*-
"""Better letter CC segmentation + illustration X regions from color seams."""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw
from collections import deque
import json

ROOT = Path(r"D:\D盘桌面\attic")
CROPPED = ROOT / "assets" / "cropped"
PUBLIC = ROOT / "public"
PARTS = PUBLIC / "parts"
LAYOUT = json.loads((PUBLIC / "cover-layout.json").read_text(encoding="utf-8"))


def connected_components(im: Image.Image, thresh=18, min_area=40):
    w, h = im.size
    px = im.load()
    visited = [[False] * w for _ in range(h)]
    comps = []

    def ink(x, y):
        return px[x, y][3] > thresh

    for y in range(h):
        for x in range(w):
            if visited[y][x] or not ink(x, y):
                continue
            q = deque([(x, y)])
            visited[y][x] = True
            cells = []
            minx = maxx = x
            miny = maxy = y
            while q:
                cx, cy = q.popleft()
                cells.append((cx, cy))
                if cx < minx: minx = cx
                if cx > maxx: maxx = cx
                if cy < miny: miny = cy
                if cy > maxy: maxy = cy
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and ink(nx, ny):
                        visited[ny][nx] = True
                        q.append((nx, ny))
            area = len(cells)
            if area >= min_area:
                comps.append(
                    {
                        "bbox": (minx, miny, maxx, maxy),
                        "area": area,
                        "cx": (minx + maxx) / 2,
                        "cy": (miny + maxy) / 2,
                    }
                )
    return comps


def segment_title_letters():
    place = LAYOUT["placements"]["text-youre-now-at"]
    im = Image.open(CROPPED / "text-youre-now-at.png").convert("RGBA")
    comps = connected_components(im, thresh=18, min_area=80)
    # Sort reading order: top row then bottom; left to right
    # Cluster into rows by cy
    comps.sort(key=lambda c: c["cy"])
    rows = []
    for c in comps:
        if not rows or abs(c["cy"] - rows[-1][0]["cy"]) > 80:
            rows.append([c])
        else:
            rows[-1].append(c)
    for row in rows:
        row.sort(key=lambda c: c["cx"])

    flat = [c for row in rows for c in row]
    print("letter comps", len(flat), "rows", [len(r) for r in rows])

    # Expected: YOU'RE NOW (9 glyphs with apos) + AT (2) = 11, or without separating apos
    labels_by_count = {
        11: ["Y", "O", "U", "apos", "R", "E", "N", "O2", "W", "A", "T"],
        10: ["Y", "O", "U", "R", "E", "N", "O2", "W", "A", "T"],  # apos merged
        9: ["Y", "O", "U", "R", "E", "N", "O2", "W", "AT"],
    }
    labels = labels_by_count.get(len(flat))
    if not labels:
        labels = [f"g{i}" for i in range(len(flat))]

    out_dir = PARTS / "letters"
    out_dir.mkdir(parents=True, exist_ok=True)
    # clear old
    for p in out_dir.glob("*.png"):
        p.unlink()

    letters = []
    pad = 3
    for i, c in enumerate(flat):
        x0, y0, x1, y1 = c["bbox"]
        x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
        x1, y1 = min(im.width - 1, x1 + pad), min(im.height - 1, y1 + pad)
        crop = im.crop((x0, y0, x1 + 1, y1 + 1))
        name = labels[i] if i < len(labels) else f"g{i}"
        fname = f"{i:02d}-{name}.png"
        crop.save(out_dir / fname)
        letters.append(
            {
                "id": f"letter-{i}",
                "file": f"parts/letters/{fname}",
                "char": name,
                "x": place["x"] + x0,
                "y": place["y"] + y0,
                "w": x1 - x0 + 1,
                "h": y1 - y0 + 1,
            }
        )
        print(f"  {fname} @ {[place['x']+x0, place['y']+y0]} size={crop.size}")

    (PUBLIC / "letters.json").write_text(
        json.dumps({"artboard": LAYOUT["meta"]["artboard"], "letters": letters}, indent=2),
        encoding="utf-8",
    )
    return letters


def illustration_regions():
    """Build 4 triangles using center + corners, with lightly jittered diagonal edges
    sampled where luminance jumps (seam)."""
    place = LAYOUT["placements"]["center-illustration"]
    im = Image.open(CROPPED / "center-illustration.png").convert("RGBA")
    w, h = im.size
    px = im.load()

    def lum(x, y):
        r, g, b, a = px[max(0, min(w - 1, x)), max(0, min(h - 1, y))]
        if a < 30:
            return None
        return 0.3 * r + 0.59 * g + 0.11 * b

    # Find center as average of strong gradient cross
    cx, cy = w // 2, h // 2
    best, best_s = (cx, cy), -1
    for y in range(int(h * 0.3), int(h * 0.7), 3):
        for x in range(int(w * 0.3), int(w * 0.7), 3):
            # score: variance of 4 diagonal neighbors
            samples = []
            for dx, dy in ((-12, -12), (12, -12), (-12, 12), (12, 12)):
                v = lum(x + dx, y + dy)
                if v is not None:
                    samples.append(v)
            if len(samples) < 4:
                continue
            mean = sum(samples) / 4
            var = sum((s - mean) ** 2 for s in samples)
            if var > best_s:
                best_s = var
                best = (x, y)
    cx, cy = best
    print("center", cx, cy, "var", best_s)

    def sample_ray(tx, ty, n=48):
        """Sample points from center to target, snapping to local luminance edge."""
        pts = [(cx, cy)]
        for i in range(1, n + 1):
            t = i / n
            x = cx + (tx - cx) * t
            y = cy + (ty - cy) * t
            ix, iy = int(x), int(y)
            # search perpendicular for strongest gradient
            best_p, best_g = (ix, iy), -1
            # perpendicular approx
            dx, dy = tx - cx, ty - cy
            length = (dx * dx + dy * dy) ** 0.5 or 1
            px_, py_ = -dy / length, dx / length
            for s in range(-5, 6):
                sx = int(ix + px_ * s)
                sy = int(iy + py_ * s)
                a = lum(sx - 1, sy - 1)
                b = lum(sx + 1, sy + 1)
                if a is None or b is None:
                    continue
                g = abs(a - b)
                if g > best_g:
                    best_g = g
                    best_p = (sx, sy)
            pts.append(best_p)
        pts.append((tx, ty))
        return pts

    tl, tr, br, bl = (2, 2), (w - 3, 2), (w - 3, h - 3), (2, h - 3)

    # Diagonals toward corners
    to_tl = sample_ray(*tl)
    to_tr = sample_ray(*tr)
    to_br = sample_ray(*br)
    to_bl = sample_ray(*bl)

    def rev(p):
        return list(reversed(p))

    def path(pts):
        d = [f"M {pts[0][0]} {pts[0][1]}"]
        for x, y in pts[1:]:
            d.append(f"L {x} {y}")
        d.append("Z")
        return " ".join(d)

    # Top triangle: center -> TL edge via to_tl, along top to TR, back via to_tr
    top = to_tl + [(2, 2), (w - 3, 2)] + rev(to_tr)[1:]
    right = to_tr + [(w - 3, 2), (w - 3, h - 3)] + rev(to_br)[1:]
    bottom = to_br + [(w - 3, h - 3), (2, h - 3)] + rev(to_bl)[1:]
    left = to_bl + [(2, h - 3), (2, 2)] + rev(to_tl)[1:]

    # Deduplicate consecutive
    def dedupe(pts):
        out = [pts[0]]
        for p in pts[1:]:
            if p != out[-1]:
                out.append(p)
        return out

    regions_local = {
        "top": dedupe(top),
        "right": dedupe(right),
        "bottom": dedupe(bottom),
        "left": dedupe(left),
    }

    dbg = im.copy()
    draw = ImageDraw.Draw(dbg, "RGBA")
    colors = {
        "top": (255, 60, 60, 70),
        "right": (60, 200, 60, 70),
        "bottom": (60, 60, 255, 70),
        "left": (220, 200, 40, 70),
    }
    for name, poly in regions_local.items():
        draw.polygon(poly, fill=colors[name], outline=(0, 0, 0, 220))
    draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=(255, 0, 255, 255))
    dbg.save(ROOT / "assets" / "tri-debug.png")

    regions = []
    for name, poly in regions_local.items():
        # downsample
        step = max(1, len(poly) // 36)
        simp = poly[::step]
        if simp[-1] != poly[-1]:
            simp.append(poly[-1])
        regions.append(
            {
                "id": name,
                "localPath": path(simp),
                "artboardPolygon": [[place["x"] + x, place["y"] + y] for x, y in simp],
            }
        )

    data = {
        "artboard": LAYOUT["meta"]["artboard"],
        "placement": place,
        "centerLocal": [cx, cy],
        "image": "center-illustration.png",
        "regions": regions,
    }
    (PUBLIC / "illustration-regions.json").write_text(
        json.dumps(data, indent=2), encoding="utf-8"
    )
    print("regions ok")
    return data


if __name__ == "__main__":
    segment_title_letters()
    illustration_regions()
