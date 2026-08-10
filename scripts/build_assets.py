# -*- coding: utf-8 -*-
"""Copy full-res layers from tmp with stable English names, crop, pack atlas, trace doors."""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw
import json
import math

SRC = Path(r"D:\D盘桌面\tmp")
ROOT = Path(r"D:\D盘桌面\attic")
FULL = ROOT / "assets" / "full"
CROPPED = ROOT / "assets" / "cropped"
PUBLIC = ROOT / "public"
ARTBOARD = (2880, 1920)

NAME_MAP = {
    "上面字.png": "text-youre-now-at",
    "下面文字.png": "checklist-text",
    "下面文字打勾打叉.png": "checklist-marks",
    "下面标题.png": "text-reason",
    "中央插画.png": "center-illustration",
    "右箭头.png": "arrow-right",
    "右边字.png": "text-right-florescent",
    "左箭头.png": "arrow-left",
    "左边字.png": "text-left-fluorescent",
    "玫红定位.png": "pin-magenta",
    "玫红色下划线.png": "underline-magenta",
    "绿色下划线.png": "underline-green",
    "绿色定位.png": "pin-green",
    "轮廓线.png": "outline",
}

# Large static art stays out of small-parts atlas
ATLAS_EXCLUDE = {"center-illustration", "outline"}


def bbox_of(im: Image.Image, alpha_thresh: int = 8, pad: int = 2):
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    alpha = im.split()[-1]
    box = alpha.getbbox()
    if not box:
        return None
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return (x0, y0, x1, y1)


def copy_full():
    FULL.mkdir(parents=True, exist_ok=True)
    for cn, en in NAME_MAP.items():
        src = SRC / cn
        if not src.exists():
            raise FileNotFoundError(src)
        dst = FULL / f"{en}.png"
        Image.open(src).save(dst)
        print("copied", cn, "->", dst.name)


def crop_all():
    CROPPED.mkdir(parents=True, exist_ok=True)
    placements = {}
    for en in NAME_MAP.values():
        im = Image.open(FULL / f"{en}.png").convert("RGBA")
        box = bbox_of(im)
        if not box:
            print("empty?", en)
            continue
        cropped = im.crop(box)
        cropped.save(CROPPED / f"{en}.png")
        x0, y0, x1, y1 = box
        placements[en] = {
            "artboard": {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0},
            "file": f"cropped/{en}.png",
        }
        print(f"crop {en}: {box} -> {cropped.size}")
    return placements


def pack_atlas(placements: dict, padding: int = 4):
    """Simple shelf packer for small interactive parts."""
    items = []
    for name, meta in placements.items():
        if name in ATLAS_EXCLUDE:
            continue
        im = Image.open(CROPPED / f"{name}.png").convert("RGBA")
        items.append((name, im))

    items.sort(key=lambda t: -t[1].height)

    # estimate width
    max_w = max(im.width for _, im in items)
    shelf_w = max(1024, max_w + padding * 2)
    x = padding
    y = padding
    row_h = 0
    frames = {}
    positions = []  # (name, x, y, im)

    for name, im in items:
        if x + im.width + padding > shelf_w:
            x = padding
            y += row_h + padding
            row_h = 0
        positions.append((name, x, y, im))
        frames[name] = {"x": x, "y": y, "w": im.width, "h": im.height}
        x += im.width + padding
        row_h = max(row_h, im.height)

    atlas_h = y + row_h + padding
    # round up to multiple of 4
    atlas_w = ((shelf_w + 3) // 4) * 4
    atlas_h = ((atlas_h + 3) // 4) * 4
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    for name, ax, ay, im in positions:
        atlas.paste(im, (ax, ay), im)

    PUBLIC.mkdir(parents=True, exist_ok=True)
    atlas_path = PUBLIC / "cover-atlas.png"
    atlas.save(atlas_path, optimize=True)
    print("atlas", atlas.size, "->", atlas_path)
    return frames, atlas.size


def sample_line_points(im: Image.Image, region, dark_thresh=90, step=3):
    """Collect dark opaque pixels in region as (x,y)."""
    x0, y0, x1, y1 = region
    px = im.load()
    pts = []
    for y in range(y0, y1, step):
        for x in range(x0, x1, step):
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            if r < dark_thresh and g < dark_thresh and b < dark_thresh:
                pts.append((x, y))
    return pts


def trace_arch_path(im: Image.Image, side: str):
    """
    Trace door fill path from outline.png.
    Door = left/right column under the arch curve, down to bottom horizontal rail.
    """
    W, H = im.size
    px = im.load()

    def is_ink(x, y):
        if x < 0 or y < 0 or x >= W or y >= H:
            return False
        r, g, b, a = px[x, y]
        return a > 40 and r < 90 and g < 90 and b < 90

    # Find vertical dividers by column ink density in mid band
    mid_y0, mid_y1 = int(H * 0.35), int(H * 0.75)
    col_counts = []
    for x in range(W):
        c = 0
        for y in range(mid_y0, mid_y1, 4):
            if is_ink(x, y):
                c += 1
        col_counts.append(c)

    # smooth
    win = 7
    smooth = []
    for i in range(W):
        s = sum(col_counts[max(0, i - win) : min(W, i + win + 1)])
        smooth.append(s)

    # find two strongest vertical peaks away from edges
    candidates = []
    for x in range(int(W * 0.15), int(W * 0.85)):
        if smooth[x] > 80 and smooth[x] >= max(smooth[max(0, x - 20) : x + 21]):
            candidates.append((smooth[x], x))
    candidates.sort(reverse=True)
    # pick two far apart
    verts = []
    for score, x in candidates:
        if all(abs(x - vx) > 200 for vx in verts):
            verts.append(x)
        if len(verts) >= 2:
            break
    verts.sort()
    if len(verts) < 2:
        # fallback approximate thirds
        verts = [int(W * 0.28), int(W * 0.72)]
    left_v, right_v = verts[0], verts[1]
    print("verticals", left_v, right_v)

    # Find top & bottom horizontal rails
    row_counts = []
    for y in range(H):
        c = 0
        for x in range(0, W, 4):
            if is_ink(x, y):
                c += 1
        row_counts.append(c)
    top_y = max(range(int(H * 0.02), int(H * 0.25)), key=lambda y: row_counts[y])
    bot_y = max(range(int(H * 0.75), int(H * 0.98)), key=lambda y: row_counts[y])
    print("horizontals", top_y, bot_y)

    def arch_polyline(x_left, x_right):
        """For each x in [x_left, x_right], find uppermost ink below top rail → arch."""
        poly = []
        for x in range(x_left, x_right + 1, 2):
            found = None
            # search from top_y+5 downward for first ink in this column region
            for y in range(top_y + 2, int(H * 0.55)):
                # look in small x neighborhood
                hit = False
                for dx in range(-2, 3):
                    if is_ink(x + dx, y):
                        hit = True
                        break
                if hit:
                    found = y
                    break
            if found is not None:
                poly.append((x, found))
        # keep only the arch (upper envelope that rises then falls)
        if len(poly) < 10:
            return poly
        # densify / lightly smooth
        smoothed = []
        for i, (x, y) in enumerate(poly):
            ys = [poly[j][1] for j in range(max(0, i - 2), min(len(poly), i + 3))]
            smoothed.append((x, int(sum(ys) / len(ys))))
        return smoothed

    if side == "left":
        x0, x1 = 8, left_v
        arch = arch_polyline(x0, x1)
        # door fill path: along arch left→right, down right post to bot, left along bottom, up left edge
        if not arch:
            arch = [(x0, int(H * 0.22)), (x1, int(H * 0.22))]
        pts = list(arch)
        pts.append((x1, bot_y))
        pts.append((x0, bot_y))
        return pts, (x0, left_v, top_y, bot_y)
    else:
        x0, x1 = right_v, W - 8
        arch = arch_polyline(x0, x1)
        if not arch:
            arch = [(x0, int(H * 0.22)), (x1, int(H * 0.22))]
        pts = list(arch)
        pts.append((x1, bot_y))
        pts.append((x0, bot_y))
        return pts, (right_v, x1, top_y, bot_y)


def points_to_svg_path(pts, close=True):
    if not pts:
        return ""
    cmds = [f"M {pts[0][0]} {pts[0][1]}"]
    for x, y in pts[1:]:
        cmds.append(f"L {x} {y}")
    if close:
        cmds.append("Z")
    return " ".join(cmds)


def simplify_polyline(pts, tol=2.5):
    """Ramer-Douglas-Peucker."""
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
        qx, qy = ax + t * dx, ay + t * dy
        return math.hypot(px - qx, py - qy)

    def rdp(points):
        if len(points) < 3:
            return points
        a, b = points[0], points[-1]
        idx, maxd = -1, -1
        for i in range(1, len(points) - 1):
            d = dist(points[i], a, b)
            if d > maxd:
                maxd = d
                idx = i
        if maxd > tol:
            left = rdp(points[: idx + 1])
            right = rdp(points[idx:])
            return left[:-1] + right
        return [a, b]

    return rdp(pts)


def write_doors_svg():
    outline = Image.open(FULL / "outline.png").convert("RGBA")
    left_pts, left_meta = trace_arch_path(outline, "left")
    right_pts, right_meta = trace_arch_path(outline, "right")
    left_pts = simplify_polyline(left_pts, tol=2.0)
    right_pts = simplify_polyline(right_pts, tol=2.0)
    left_d = points_to_svg_path(left_pts)
    right_d = points_to_svg_path(right_pts)

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ARTBOARD[0]} {ARTBOARD[1]}" width="{ARTBOARD[0]}" height="{ARTBOARD[1]}">
  <path id="door-left" d="{left_d}" fill="black" fill-opacity="0.001" stroke="none"/>
  <path id="door-right" d="{right_d}" fill="black" fill-opacity="0.001" stroke="none"/>
</svg>
'''
    (PUBLIC / "doors.svg").write_text(svg, encoding="utf-8")

    # debug overlay
    dbg = outline.copy()
    draw = ImageDraw.Draw(dbg, "RGBA")
    if len(left_pts) > 2:
        draw.polygon(left_pts, fill=(0, 200, 80, 60), outline=(0, 200, 80, 200))
    if len(right_pts) > 2:
        draw.polygon(right_pts, fill=(200, 50, 160, 60), outline=(200, 50, 160, 200))
    dbg.save(ROOT / "assets" / "doors-debug.png")
    print("doors svg written", "left pts", len(left_pts), "right pts", len(right_pts))
    return {
        "left": {"d": left_d, "meta": left_meta},
        "right": {"d": right_d, "meta": right_meta},
    }


def main():
    copy_full()
    placements = crop_all()
    frames, atlas_size = pack_atlas(placements)
    doors = write_doors_svg()

    # copy large assets to public
    for name in ATLAS_EXCLUDE:
        Image.open(CROPPED / f"{name}.png").save(PUBLIC / f"{name}.png", optimize=True)

    layout = {
        "meta": {
            "artboard": {"w": ARTBOARD[0], "h": ARTBOARD[1]},
            "background": "#dee1f6",
            "atlas": {"image": "cover-atlas.png", "size": {"w": atlas_size[0], "h": atlas_size[1]}},
            "dpi": 300,
        },
        "frames": frames,
        "placements": {},
        "doors": {
            "left": {"pathId": "door-left", "href": "https://attic.fluorescentmice.fun"},
            "right": {"pathId": "door-right", "href": "https://attic.fluorescentmice.fun"},
        },
    }

    for name, meta in placements.items():
        entry = {
            "x": meta["artboard"]["x"],
            "y": meta["artboard"]["y"],
            "w": meta["artboard"]["w"],
            "h": meta["artboard"]["h"],
        }
        if name in frames:
            entry["frame"] = name
            entry["source"] = "atlas"
        else:
            entry["file"] = f"{name}.png"
            entry["source"] = "file"
        layout["placements"][name] = entry

    (PUBLIC / "cover-layout.json").write_text(
        json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (ROOT / "assets" / "cover-layout.json").write_text(
        json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("layout written")


if __name__ == "__main__":
    main()
