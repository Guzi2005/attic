# -*- coding: utf-8 -*-
"""Fast door contours: downsample flood-fill, then scale back."""
from pathlib import Path
from PIL import Image, ImageDraw
from collections import deque
import math

ROOT = Path(r"D:\D盘桌面\attic")
FULL = ROOT / "assets" / "full"
PUBLIC = ROOT / "public"
W, H = 2880, 1920
SCALE = 4  # work at 1/4 res


def is_ink_img(img, x, y, thresh=70):
    if x < 0 or y < 0 or x >= img.width or y >= img.height:
        return True  # treat OOB as wall
    r, g, b, a = img.getpixel((x, y))
    return a > 40 and r < thresh and g < thresh and b < thresh


def find_structure(full):
    px = full.load()
    mid_y0, mid_y1 = int(H * 0.4), int(H * 0.7)

    def ink(x, y):
        r, g, b, a = px[x, y]
        return a > 40 and r < 70 and g < 70 and b < 70

    col = [sum(1 for y in range(mid_y0, mid_y1, 3) if ink(x, y)) for x in range(W)]
    smooth = [sum(col[max(0, i - 5) : min(W, i + 6)]) for i in range(W)]
    peaks = []
    for x in range(int(W * 0.18), int(W * 0.82)):
        if smooth[x] > 60 and smooth[x] == max(smooth[x - 15 : x + 16]):
            peaks.append((smooth[x], x))
    peaks.sort(reverse=True)
    verts = []
    for _, x in peaks:
        if all(abs(x - v) > 250 for v in verts):
            verts.append(x)
        if len(verts) >= 2:
            break
    verts.sort()
    left_v, right_v = verts if len(verts) == 2 else (914, 1966)
    row = [sum(1 for x in range(0, W, 3) if ink(x, y)) for y in range(H)]
    top_y = max(range(20, 200), key=lambda y: row[y])
    bot_y = max(range(H - 200, H - 20), key=lambda y: row[y])
    return left_v, right_v, top_y, bot_y


def flood(small, seed, bounds):
    x_lo, x_hi, y_lo, y_hi = bounds
    visited = set()
    q = deque([seed])
    visited.add(seed)
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < x_lo or nx > x_hi or ny < y_lo or ny > y_hi:
                continue
            if (nx, ny) in visited:
                continue
            if is_ink_img(small, nx, ny):
                continue
            visited.add((nx, ny))
            q.append((nx, ny))
    return visited


def erode(region, small, bounds, radius=2):
    x_lo, x_hi, y_lo, y_hi = bounds
    out = set()
    for x, y in region:
        ok = True
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                if dx * dx + dy * dy > radius * radius:
                    continue
                nx, ny = x + dx, y + dy
                if nx < x_lo or nx > x_hi or ny < y_lo or ny > y_hi or is_ink_img(small, nx, ny):
                    ok = False
                    break
            if not ok:
                break
        if ok:
            out.add((x, y))
    return out


def contour(region):
    if not region:
        return []
    start = min(region, key=lambda p: (p[1], p[0]))
    dirs = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
    pts = []
    x, y = start
    bx, by = x - 1, y
    for _ in range(len(region) * 2):
        pts.append((x, y))
        try:
            bi = dirs.index((bx - x, by - y))
        except ValueError:
            bi = 4
        found = False
        for k in range(8):
            di = (bi + 1 + k) % 8
            dx, dy = dirs[di]
            nx, ny = x + dx, y + dy
            if (nx, ny) in region:
                pdi = (di + 7) % 8
                bx, by = x + dirs[pdi][0], y + dirs[pdi][1]
                x, y = nx, ny
                found = True
                break
        if not found:
            break
        if (x, y) == start and len(pts) > 8:
            break
    return pts


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


def path_d(pts):
    parts = [f"M {pts[0][0]} {pts[0][1]}"]
    for x, y in pts[1:]:
        parts.append(f"L {x} {y}")
    parts.append("Z")
    return " ".join(parts)


def door_poly(small, seed, bounds, erode_r=3):
    region = flood(small, seed, bounds)
    print("  flood", len(region))
    region = erode(region, small, bounds, radius=erode_r)
    print("  eroded", len(region))
    pts = contour(region)
    if len(pts) > 500:
        pts = pts[:: max(1, len(pts) // 300)]
    pts = rdp(pts, tol=1.6)
    # scale back to full res
    return [(p[0] * SCALE, p[1] * SCALE) for p in pts]


def seal_arch(small, x_lo, x_hi, y_lo, y_hi):
    """Close gaps above the door arch so flood cannot leak through the lintel."""
    draw = ImageDraw.Draw(small)
    for x in range(x_lo, x_hi + 1):
        y = y_lo
        # skip top rail cluster
        while y < y_hi and is_ink_img(small, x, y):
            y += 1
        gap_start = y
        while y < y_hi and not is_ink_img(small, x, y):
            y += 1
        if y >= y_hi:
            continue
        arch_top = y
        # fill the gap under the top rail down to the arch top (inclusive)
        if arch_top > gap_start:
            draw.line([(x, gap_start), (x, arch_top)], fill=(10, 10, 10, 255), width=2)


def main():
    full = Image.open(FULL / "outline.png").convert("RGBA")
    left_v, right_v, top_y, bot_y = find_structure(full)
    print("structure", left_v, right_v, top_y, bot_y)

    small = full.resize((W // SCALE, H // SCALE), Image.BILINEAR)
    # thicken ink so walls are solid
    px = small.load()
    ink_pts = []
    for y in range(small.height):
        for x in range(small.width):
            r, g, b, a = px[x, y]
            if a > 40 and r < 90 and g < 90 and b < 90:
                ink_pts.append((x, y))
    draw = ImageDraw.Draw(small)
    for x, y in ink_pts:
        draw.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(20, 20, 20, 255))

    sw, sh = small.size
    lv, rv = left_v // SCALE, right_v // SCALE
    ty, by = top_y // SCALE, bot_y // SCALE

    # no arch sealing — rely on thicker ink + stronger erosion
    left_seed = (max(2, lv // 2), min(sh - 3, (ty + by) // 2 + 20))
    right_seed = (min(sw - 3, (rv + sw) // 2), min(sh - 3, (ty + by) // 2 + 20))
    # nudge seeds off ink
    def nudge(seed, x_lo, x_hi):
        x, y = seed
        if not is_ink_img(small, x, y):
            return seed
        for yy in range(y, by - 5, 2):
            if not is_ink_img(small, x, yy):
                return (x, yy)
        return seed

    left_seed = nudge(left_seed, 1, lv - 1)
    right_seed = nudge(right_seed, rv + 1, sw - 2)
    print("seeds", left_seed, right_seed)

    left_pts = door_poly(small, left_seed, (1, lv - 1, ty + 1, by - 1), erode_r=3)
    right_pts = door_poly(small, right_seed, (rv + 1, sw - 2, ty + 1, by - 1), erode_r=3)
    if len(left_pts) < 3 or len(right_pts) < 3:
        raise SystemExit(f"door trace failed L={len(left_pts)} R={len(right_pts)}")

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <path id="door-left" d="{path_d(left_pts)}"/>
  <path id="door-right" d="{path_d(right_pts)}"/>
</svg>
'''
    (PUBLIC / "doors.svg").write_text(svg, encoding="utf-8")

    dbg = full.copy()
    d = ImageDraw.Draw(dbg, "RGBA")
    if len(left_pts) >= 3:
        d.polygon(left_pts, fill=(0, 180, 80, 90), outline=(0, 255, 120, 255))
    if len(right_pts) >= 3:
        d.polygon(right_pts, fill=(180, 40, 140, 90), outline=(255, 80, 180, 255))
    dbg.save(ROOT / "assets" / "doors-debug.png")
    print("left", len(left_pts), "right", len(right_pts))


if __name__ == "__main__":
    main()
