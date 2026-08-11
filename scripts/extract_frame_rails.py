# -*- coding: utf-8 -*-
"""Rebuild frame rails: hand-written full-width horizontals past vertical crossings."""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(r"D:\D盘桌面\attic")
FULL = ROOT / "assets" / "full"
PUBLIC = ROOT / "public"
W, H = 2880, 1920


def is_ink(px, x, y, thresh=80):
    if x < 0 or y < 0 or x >= W or y >= H:
        return False
    r, g, b, a = px[x, y]
    return a > 40 and r < thresh and g < thresh and b < thresh


def row_ink_count(px, y, step=2):
    return sum(1 for x in range(0, W, step) if is_ink(px, x, y))


def find_main_rail_y(px, y0, y1):
    scores = [(row_ink_count(px, y), y) for y in range(y0, y1)]
    scores.sort(reverse=True)
    return scores[0][1] if scores and scores[0][0] > W // 10 else None


def sample_horizontal(px, y_hint, band=8, step=2):
    pts = []
    for x in range(0, W, step):
        ys = [y for y in range(y_hint - band, y_hint + band + 1) if is_ink(px, x, y)]
        if not ys:
            pts.append((x, None))
            continue
        y = min(ys, key=lambda yy: abs(yy - y_hint))
        pts.append((x, y))
    return pts


def fill_gaps(pts, y_fallback):
    out = []
    for i, (x, y) in enumerate(pts):
        if y is not None:
            out.append((x, y))
            continue
        left = right = None
        for j in range(i - 1, -1, -1):
            if pts[j][1] is not None:
                left = pts[j]
                break
        for j in range(i + 1, len(pts)):
            if pts[j][1] is not None:
                right = pts[j]
                break
        if left and right and right[0] != left[0]:
            t = (x - left[0]) / (right[0] - left[0])
            yy = int(left[1] + t * (right[1] - left[1]))
        elif left:
            yy = left[1]
        elif right:
            yy = right[1]
        else:
            yy = y_fallback
        out.append((x, yy))
    return out


def smooth(pts, k=3):
    out = []
    for i, (x, y) in enumerate(pts):
        ys = [pts[j][1] for j in range(max(0, i - k), min(len(pts), i + k + 1))]
        out.append((x, int(sum(ys) / len(ys))))
    return out


def handwriting_wobble(pts, seed=7, amp=2.4):
    """Keep dense points; add pen-like micro jitter without losing full span."""
    rng = random.Random(seed)
    out = []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        t = i / max(1, n - 1)
        # slow drift + fine tremor + occasional pressure nudge
        drift = amp * math.sin(t * math.pi * 3.2 + seed) + 0.7 * amp * math.sin(
            t * math.pi * 11.0 + seed * 0.37
        )
        tremor = (rng.random() - 0.5) * amp * 0.9
        # slightly steadier near ends so edges meet cleanly
        edge = min(t, 1 - t)
        damp = min(1.0, edge * 8.0)
        yy = int(round(y + (drift + tremor) * damp))
        out.append((x, max(0, min(H - 1, yy))))
    out[0] = (0, out[0][1])
    out[-1] = (W - 1, out[-1][1])
    return out


def resample(pts, step=4):
    """Ensure continuous x from 0..W-1 with given step."""
    if not pts:
        return [(0, 0), (W - 1, 0)]
    by_x = {x: y for x, y in pts}
    xs = sorted(by_x)
    out = []
    for x in range(0, W, step):
        # interpolate between known
        if x in by_x:
            out.append((x, by_x[x]))
            continue
        # find neighbors
        lo = max((xx for xx in xs if xx <= x), default=xs[0])
        hi = min((xx for xx in xs if xx >= x), default=xs[-1])
        if hi == lo:
            y = by_x[lo]
        else:
            t = (x - lo) / (hi - lo)
            y = int(by_x[lo] + t * (by_x[hi] - by_x[lo]))
        out.append((x, y))
    if out[-1][0] != W - 1:
        # last from original end
        out.append((W - 1, pts[-1][1]))
    return out


def path_d_hand(pts):
    """Polyline dense enough to read as ink; round joins via many short segments."""
    if len(pts) < 2:
        return ""
    parts = [f"M {pts[0][0]} {pts[0][1]}"]
    for x, y in pts[1:]:
        parts.append(f"L {x} {y}")
    return " ".join(parts)


def synthesize_edge(y_base, twin_pts, seed=3):
    avg = sum(y for _, y in twin_pts) / len(twin_pts)
    offset = y_base - avg
    pts = [(x, max(0, min(H - 1, int(y + offset)))) for x, y in twin_pts]
    pts = handwriting_wobble(pts, seed=seed, amp=1.8)
    pts[0] = (0, pts[0][1])
    pts[-1] = (W - 1, pts[-1][1])
    return pts


def sample_vertical(px, x_hint, band=6, step=2):
    pts = []
    for y in range(0, H, step):
        xs = [x for x in range(x_hint - band, x_hint + band + 1) if is_ink(px, x, y)]
        if not xs:
            pts.append((None, y))
            continue
        x = min(xs, key=lambda xx: abs(xx - x_hint))
        pts.append((x, y))
    return pts


def fill_gaps_vertical(pts, x_fallback):
    out = []
    for i, (x, y) in enumerate(pts):
        if x is not None:
            out.append((x, y))
            continue
        left = right = None
        for j in range(i - 1, -1, -1):
            if pts[j][0] is not None:
                left = pts[j]
                break
        for j in range(i + 1, len(pts)):
            if pts[j][0] is not None:
                right = pts[j]
                break
        if left and right and right[1] != left[1]:
            t = (y - left[1]) / (right[1] - left[1])
            xx = int(left[0] + t * (right[0] - left[0]))
        elif left:
            xx = left[0]
        elif right:
            xx = right[0]
        else:
            xx = x_fallback
        out.append((xx, y))
    return out


def smooth_vertical(pts, k=4):
    out = []
    for i, (x, y) in enumerate(pts):
        xs = [pts[j][0] for j in range(max(0, i - k), min(len(pts), i + k + 1))]
        out.append((int(sum(xs) / len(xs)), y))
    return out


def rdp(pts, tol=1.8):
    if len(pts) < 3:
        return pts

    def dist(p, a, b):
        ax, ay = a
        bx, by = b
        px, py = p
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    def rec(points):
        if len(points) < 3:
            return points
        a, b = points[0], points[-1]
        idx, maxd = -1, -1.0
        for i in range(1, len(points) - 1):
            d = dist(points[i], a, b)
            if d > maxd:
                maxd, idx = d, i
        if maxd > tol:
            return rec(points[: idx + 1])[:-1] + rec(points[idx:])
        return [a, b]

    return rec(pts)


def build_horizontal_rail(px, y_hint, band=8, seed=7):
    raw = sample_horizontal(px, y_hint, band=band, step=2)
    known_n = sum(1 for _, y in raw if y is not None)
    print(f"  y={y_hint} samples={known_n}/{len(raw)}")
    pts = fill_gaps(raw, y_hint)
    pts = smooth(pts, k=2)
    pts = resample(pts, step=3)
    pts = handwriting_wobble(pts, seed=seed, amp=2.6)
    # force full width — continue past every vertical crossing to page edges
    pts[0] = (0, pts[0][1])
    pts[-1] = (W - 1, pts[-1][1])
    return pts


def build_vertical_rail(px, x_hint, band=6):
    raw = sample_vertical(px, x_hint, band=band, step=3)
    pts = fill_gaps_vertical(raw, x_hint)
    pts = smooth_vertical(pts)
    if pts[0][1] != 0:
        pts.insert(0, (pts[0][0], 0))
    else:
        pts[0] = (pts[0][0], 0)
    if pts[-1][1] != H - 1:
        pts.append((pts[-1][0], H - 1))
    else:
        pts[-1] = (pts[-1][0], H - 1)
    return rdp(pts, tol=2.0)


def clear_horizontal_fragments(im: Image.Image, y_center: int, half: int = 5):
    """Remove broken bitmap horizontals in a thin band so SVG rails read cleanly.
    Keeps strongly vertical/arch strokes (more vertical neighbors than horizontal).
    """
    px = im.load()
    cleared = 0
    for y in range(max(0, y_center - half), min(H, y_center + half + 1)):
        for x in range(W):
            if not is_ink(px, x, y):
                continue
            h_n = sum(
                1
                for dx in (-3, -2, -1, 1, 2, 3)
                if is_ink(px, x + dx, y)
            )
            v_n = sum(
                1
                for dy in (-3, -2, -1, 1, 2, 3)
                if is_ink(px, x, y + dy)
            )
            # horizontal-ish ink → clear; arch/vertical dominates → keep
            if h_n >= v_n and h_n >= 2:
                r, g, b, _a = px[x, y]
                px[x, y] = (r, g, b, 0)
                cleared += 1
    return cleared


def main():
    src = FULL / "outline.png"
    if not src.exists():
        src = PUBLIC / "outline.png"
    im = Image.open(src).convert("RGBA")
    px = im.load()

    top_inner_y = find_main_rail_y(px, 20, int(H * 0.18)) or 57
    bot_inner_y = find_main_rail_y(px, int(H * 0.82), H - 20) or 1856
    print("inner rails", top_inner_y, bot_inner_y)

    top_inner = build_horizontal_rail(px, top_inner_y, band=8, seed=11)
    bot_inner = build_horizontal_rail(px, bot_inner_y, band=8, seed=23)
    top_outer = synthesize_edge(2, top_inner, seed=5)
    bot_outer = synthesize_edge(H - 3, bot_inner, seed=13)

    left_outer = build_vertical_rail(px, 2, band=8)
    right_outer = build_vertical_rail(px, W - 3, band=8)

    # strip fragmented horizontals from outline bitmap (keep arches)
    outline = im.copy()
    c1 = clear_horizontal_fragments(outline, top_inner_y, half=4)
    c2 = clear_horizontal_fragments(outline, bot_inner_y, half=4)
    # also near outer edges if present
    c3 = clear_horizontal_fragments(outline, 3, half=3)
    c4 = clear_horizontal_fragments(outline, H - 4, half=3)
    print(f"cleared horizontal fragments: {c1+c2+c3+c4}")

    for dest in (
        PUBLIC / "outline.png",
        FULL / "outline.png",
        ROOT / "assets" / "cropped" / "outline.png",
    ):
        if dest.parent.exists() or dest == PUBLIC / "outline.png":
            dest.parent.mkdir(parents=True, exist_ok=True)
            outline.save(dest)

    rails = {
        "top-outer": top_outer,
        "top-inner": top_inner,
        "bottom-inner": bot_inner,
        "bottom-outer": bot_outer,
        "left-outer": left_outer,
        "right-outer": right_outer,
    }

    svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" fill="none" overflow="visible">',
    ]
    meta_rails = {}
    for name, pts in rails.items():
        d = path_d_hand(pts)
        svg.append(
            f'  <path id="{name}" class="frame-rail" data-rail="{name}" d="{d}" '
            f'stroke="#1a1a1a" stroke-width="2.2" stroke-linecap="round" '
            f'stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
        )
        meta_rails[name] = {
            "d": d,
            "start": list(pts[0]),
            "end": list(pts[-1]),
            "n": len(pts),
        }
        print(name, "n=", len(pts), "ends", pts[0], "→", pts[-1])
    svg.append("</svg>")
    (PUBLIC / "frame-rails.svg").write_text("\n".join(svg), encoding="utf-8")
    (PUBLIC / "frame-rails.json").write_text(
        json.dumps({"artboard": {"w": W, "h": H}, "rails": meta_rails}, indent=2),
        encoding="utf-8",
    )

    dbg = outline.convert("RGBA")
    draw = ImageDraw.Draw(dbg)
    colors = {
        "top-outer": (220, 40, 40, 255),
        "top-inner": (40, 120, 220, 255),
        "bottom-inner": (40, 180, 80, 255),
        "bottom-outer": (200, 80, 200, 255),
        "left-outer": (255, 160, 40, 255),
        "right-outer": (160, 80, 255, 255),
    }
    for name, pts in rails.items():
        draw.line(pts, fill=colors[name], width=3)
    dbg.save(ROOT / "assets" / "rails-debug.png")
    print("wrote frame-rails.svg + cleaned outline + rails-debug.png")


if __name__ == "__main__":
    main()
