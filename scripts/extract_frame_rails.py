# -*- coding: utf-8 -*-
"""Extract top/bottom frame rails; extend to full width following outline wobble."""
from pathlib import Path
from PIL import Image, ImageDraw
import json
import math

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


def sample_horizontal(px, y_hint, band=6, step=2):
    """Sample only near y_hint so door arches don't contaminate."""
    pts = []
    for x in range(0, W, step):
        ys = [y for y in range(y_hint - band, y_hint + band + 1) if is_ink(px, x, y)]
        if not ys:
            pts.append((x, None))
            continue
        # closest to hint
        y = min(ys, key=lambda yy: abs(yy - y_hint))
        pts.append((x, y))
    return pts


def fill_gaps(pts, y_fallback):
    """Interpolate None gaps; keep known samples."""
    known = [(x, y) for x, y in pts if y is not None]
    if not known:
        return [(x, y_fallback) for x, _ in pts]
    out = []
    for i, (x, y) in enumerate(pts):
        if y is not None:
            out.append((x, y))
            continue
        # nearest known left/right
        left = None
        right = None
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


def smooth(pts, k=4):
    out = []
    for i, (x, y) in enumerate(pts):
        ys = [pts[j][1] for j in range(max(0, i - k), min(len(pts), i + k + 1))]
        out.append((x, int(sum(ys) / len(ys))))
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


def synthesize_edge(y_base, twin_pts=None):
    """Full-width edge line: follow twin rail wobble offset, or gentle jitter."""
    if twin_pts and len(twin_pts) >= 2:
        # parallel offset from twin toward the edge
        avg = sum(y for _, y in twin_pts) / len(twin_pts)
        offset = y_base - avg
        pts = [(x, max(0, min(H - 1, int(y + offset)))) for x, y in twin_pts]
        # force ends
        pts[0] = (0, pts[0][1] if pts[0][0] == 0 else max(0, min(H - 1, int(twin_pts[0][1] + offset))))
        if pts[0][0] != 0:
            pts.insert(0, (0, pts[0][1]))
        if pts[-1][0] != W - 1:
            pts.append((W - 1, pts[-1][1]))
        else:
            pts[-1] = (W - 1, pts[-1][1])
        return pts
    pts = []
    for x in range(0, W, 6):
        j = int(1.6 * math.sin(x * 0.009) + 0.9 * math.sin(x * 0.031 + 0.7))
        pts.append((x, max(0, min(H - 1, y_base + j))))
    pts[0] = (0, pts[0][1])
    pts.append((W - 1, pts[-1][1]))
    return pts


def path_d(pts):
    parts = [f"M {pts[0][0]} {pts[0][1]}"]
    for x, y in pts[1:]:
        parts.append(f"L {x} {y}")
    return " ".join(parts)


def sample_vertical(px, x_hint, band=6, step=2):
    """Sample ink near a vertical edge x_hint."""
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
    known = [(x, y) for x, y in pts if x is not None]
    if not known:
        return [(x_fallback, y) for _, y in pts]
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


def synthesize_vertical_edge(x_base, sampled_pts=None):
    """Full-height vertical edge, prefer sampled outline wobble."""
    if sampled_pts and len(sampled_pts) >= 4:
        known = sum(1 for x, _ in sampled_pts if abs(x - x_base) <= 12)
        if known >= len(sampled_pts) * 0.15:
            pts = list(sampled_pts)
            if pts[0][1] != 0:
                pts.insert(0, (pts[0][0], 0))
            else:
                pts[0] = (pts[0][0], 0)
            if pts[-1][1] != H - 1:
                pts.append((pts[-1][0], H - 1))
            else:
                pts[-1] = (pts[-1][0], H - 1)
            return pts
    pts = []
    for y in range(0, H, 6):
        j = int(1.5 * math.sin(y * 0.01) + 0.8 * math.sin(y * 0.033 + 0.9))
        pts.append((max(0, min(W - 1, x_base + j)), y))
    pts[0] = (pts[0][0], 0)
    pts.append((pts[-1][0], H - 1))
    return pts


def build_vertical_rail(px, x_hint, band=6):
    raw = sample_vertical(px, x_hint, band=band, step=3)
    known_n = sum(1 for x, _ in raw if x is not None)
    print(f"  x={x_hint} samples={known_n}/{len(raw)}")
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


def build_rail(px, y_hint, band=6):
    raw = sample_horizontal(px, y_hint, band=band, step=3)
    known_n = sum(1 for _, y in raw if y is not None)
    print(f"  y={y_hint} samples={known_n}/{len(raw)}")
    pts = fill_gaps(raw, y_hint)
    pts = smooth(pts)
    # ensure full width ends
    if pts[0][0] != 0:
        pts.insert(0, (0, pts[0][1]))
    else:
        pts[0] = (0, pts[0][1])
    if pts[-1][0] != W - 1:
        pts.append((W - 1, pts[-1][1]))
    else:
        pts[-1] = (W - 1, pts[-1][1])
    return rdp(pts, tol=2.0)


def main():
    im = Image.open(FULL / "outline.png").convert("RGBA")
    px = im.load()

    top_inner_y = find_main_rail_y(px, 20, int(H * 0.18)) or 57
    bot_inner_y = find_main_rail_y(px, int(H * 0.82), H - 20) or 1856
    print("inner rails", top_inner_y, bot_inner_y)

    top_inner = build_rail(px, top_inner_y, band=7)
    bot_inner = build_rail(px, bot_inner_y, band=7)

    # outer parallels: artboard edges, following the same wobble as inner rails
    top_outer = synthesize_edge(1, twin_pts=top_inner)
    bot_outer = synthesize_edge(H - 2, twin_pts=bot_inner)
    top_outer = rdp(top_outer, tol=2.0)
    bot_outer = rdp(bot_outer, tol=2.0)

    # left / right outer verticals — full height
    left_sampled = build_vertical_rail(px, 2, band=8)
    right_sampled = build_vertical_rail(px, W - 3, band=8)
    left_outer = synthesize_vertical_edge(1, sampled_pts=left_sampled)
    right_outer = synthesize_vertical_edge(W - 2, sampled_pts=right_sampled)
    left_outer = rdp(left_outer, tol=2.0)
    right_outer = rdp(right_outer, tol=2.0)

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
        d = path_d(pts)
        svg.append(
            f'  <path id="{name}" class="frame-rail" data-rail="{name}" d="{d}" '
            f'stroke="#1a1a1a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
        )
        meta_rails[name] = {"d": d, "start": list(pts[0]), "end": list(pts[-1])}
        print(name, "n=", len(pts), "ends", pts[0], pts[-1])
    svg.append("</svg>")
    (PUBLIC / "frame-rails.svg").write_text("\n".join(svg), encoding="utf-8")
    (PUBLIC / "frame-rails.json").write_text(
        json.dumps({"artboard": {"w": W, "h": H}, "rails": meta_rails}, indent=2),
        encoding="utf-8",
    )

    # debug overlay
    dbg = im.convert("RGBA").copy()
    draw = ImageDraw.Draw(dbg)
    colors = {
        "top-outer": (220, 40, 40),
        "top-inner": (40, 120, 220),
        "bottom-inner": (40, 180, 80),
        "bottom-outer": (200, 80, 200),
        "left-outer": (255, 160, 40),
        "right-outer": (160, 80, 255),
    }
    for name, pts in rails.items():
        draw.line(pts, fill=colors[name] + (255,), width=3)
    dbg.save(ROOT / "assets" / "rails-debug.png")
    print("wrote frame-rails.svg + rails-debug.png")


if __name__ == "__main__":
    main()
