# -*- coding: utf-8 -*-
"""Export void row + transparent circle/swallow cutouts (no BG rectangles)."""
from pathlib import Path
from math import hypot

from PIL import Image

ROOT = Path(r"D:\D盘桌面\attic")
SRC = ROOT / "public" / "parts" / "cover-pattern-ref.png"
OUT = ROOT / "public" / "parts" / "cover-void-pattern.png"
OUT_CIRCLE = ROOT / "public" / "parts" / "cover-void-circle.png"
OUT_SWALLOW = ROOT / "public" / "parts" / "cover-void-swallow.png"
OUT_CIRCLE_R = ROOT / "public" / "parts" / "cover-void-circle-r.png"
OUT_SWALLOW_R = ROOT / "public" / "parts" / "cover-void-swallow-r.png"
OUT_META = ROOT / "public" / "parts" / "cover-void-splits.json"
BG = (0xDE, 0xE1, 0xF6)

SPLIT_L = 448
SPLIT_R = 588
ROW_H = 517
# Beak tips cross the circle|swallow split — peek into the circle side when exporting.
BEAK_PAD = 22


def remap_bg(im):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 210 and g > 210 and b > 210:
                px[x, y] = (*BG, 255)
            elif abs(r - g) < 18 and abs(g - b) < 18 and r > 180:
                t = (r - 180) / 75
                px[x, y] = (
                    int(r * (1 - t) + BG[0] * t),
                    int(g * (1 - t) + BG[1] * t),
                    int(b * (1 - t) + BG[2] * t),
                    255,
                )


def is_bg(r, g, b, tol=14):
    return abs(r - BG[0]) <= tol and abs(g - BG[1]) <= tol and abs(b - BG[2]) <= tol


def is_swallow(r, g, b):
    return r < 138 and g < 138 and b < 138 and not is_bg(r, g, b, 10)


def is_circle(r, g, b):
    if is_bg(r, g, b, 12):
        return False
    if r < 152 or g < 152 or b < 152:
        return False
    if abs(r - g) > 26 or abs(g - b) > 26:
        return False
    return 150 < r < 215


def estimate_disk(src, w, h):
    candidates = [
        (x, y)
        for y in range(h)
        for x in range(w)
        if is_circle(*src[x, y][:3])
    ]
    if not candidates:
        return 0.0, 0.0, 0.0
    core = [(x, y) for x, y in candidates if y < h - 40]
    if len(core) < 64:
        core = candidates
    cx = sum(x for x, y in core) / len(core)
    cy = sum(y for x, y in core) / len(core)
    dists = sorted(hypot(x - cx, y - cy) for x, y in core)
    radius = dists[int(len(dists) * 0.94)]
    return cx, cy, radius


def near_swallow(src, x, y, w, h, radius=1):
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and is_swallow(*src[nx, ny][:3]):
                return True
    return False


def scrub_circle_tangent(crop):
    """Remove swallow ink and tangent strokes outside the fitted disk."""
    px = crop.load()
    w, h = crop.size
    cx, cy, radius = estimate_disk(px, w, h)
    if radius <= 0:
        return
    limit = radius + 1.0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_swallow(r, g, b) or hypot(x - cx, y - cy) > limit:
                px[x, y] = (*BG, 255)


def matte_circle(crop):
    scrub_circle_tangent(crop)
    src = crop.load()
    w, h = crop.size
    cx, cy, radius = estimate_disk(src, w, h)
    limit = radius + 1.0 if radius > 0 else 0.0
    out = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if not is_circle(r, g, b):
                continue
            if radius > 0 and hypot(x - cx, y - cy) > limit:
                continue
            if near_swallow(src, x, y, w, h) and (r < 178 or g < 178 or b < 178):
                continue
            dst[x, y] = (r, g, b, 255)
    return out


def matte_swallow(crop):
    out = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    src = crop.load()
    dst = out.load()
    for y in range(crop.size[1]):
        for x in range(crop.size[0]):
            r, g, b, a = src[x, y]
            if is_swallow(r, g, b):
                dst[x, y] = (r, g, b, 255)
    return out


def scrub_row_ink(row, side, keep_left_circle=True):
    px = row.load()
    row_h = row.size[1]
    x_limit = min(SPLIT_L, side) if keep_left_circle else SPLIT_R
    for y in range(max(0, row_h - 20), row_h):
        for x in range(x_limit):
            r, g, b, a = px[x, y]
            if is_swallow(r, g, b):
                px[x, y] = (*BG, 255)


im = Image.open(SRC).convert("RGBA")
remap_bg(im)
side = min(im.size)
full = im.crop((0, 0, side, side))
total = side

top = full.crop((0, 0, side, ROW_H))
scrub_row_ink(top, side, keep_left_circle=True)
top.save(OUT, optimize=True)

def disc_metrics(im: Image.Image, thresh: int = 40):
    a = im.split()[-1]
    w, h = im.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if a.getpixel((x, y)) >= thresh:
                xs.append(x)
                ys.append(y)
    if not xs:
        return {"discCx": 0.5, "discCy": 0.5, "discRFracW": 0.38}
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    cx = (minx + maxx) / 2
    cy = (miny + maxy) / 2
    r = min((maxx - minx) / 2, (maxy - miny) / 2)
    return {
        "discCx": round(cx / w, 4),
        "discCy": round(cy / h, 4),
        "discRFracW": round(r / w, 4),
    }


circle_l = matte_circle(top.crop((0, 0, SPLIT_L, ROW_H)))
circle_l.save(OUT_CIRCLE, optimize=True)

# Swallow crop + beak tip that sits on the circle side of the split
sw_l = matte_swallow(top.crop((SPLIT_L, 0, total, ROW_H)))
beak_l = matte_swallow(top.crop((max(0, SPLIT_L - BEAK_PAD), 0, SPLIT_L, ROW_H)))
sw_l_out = Image.new("RGBA", (BEAK_PAD + sw_l.size[0], ROW_H), (0, 0, 0, 0))
sw_l_out.paste(beak_l, (0, 0), beak_l)
sw_l_out.paste(sw_l, (BEAK_PAD, 0), sw_l)
sw_l_out.save(OUT_SWALLOW, optimize=True)

bottom_y = side - ROW_H
bottom = full.crop((0, bottom_y, side, bottom_y + ROW_H))
scrub_row_ink(bottom, side, keep_left_circle=False)

circle_r = matte_circle(bottom.crop((SPLIT_R, 0, total, ROW_H)))
circle_r.save(OUT_CIRCLE_R, optimize=True)

sw_r = matte_swallow(bottom.crop((0, 0, SPLIT_R, ROW_H)))
beak_r = matte_swallow(bottom.crop((SPLIT_R, 0, min(total, SPLIT_R + BEAK_PAD), ROW_H)))
sw_r_out = Image.new("RGBA", (sw_r.size[0] + BEAK_PAD, ROW_H), (0, 0, 0, 0))
sw_r_out.paste(sw_r, (0, 0), sw_r)
sw_r_out.paste(beak_r, (SPLIT_R, 0), beak_r)  # SPLIT_R == sw_r.width
sw_r_out.save(OUT_SWALLOW_R, optimize=True)

disc_l = disc_metrics(circle_l)
disc_r = disc_metrics(circle_r)

meta = {
    "rowH": ROW_H,
    "totalW": total,
    "leftRow": {
        "circleW": SPLIT_L,
        "swallowW": total - SPLIT_L,
        "beakPad": BEAK_PAD,
        "beakSide": "left",
        **disc_l,
    },
    "rightRow": {
        "swallowW": SPLIT_R,
        "circleW": total - SPLIT_R,
        "beakPad": BEAK_PAD,
        "beakSide": "right",
        **disc_r,
    },
    "matte": True,
}
OUT_META.write_text(__import__("json").dumps(meta, indent=2), encoding="utf-8")

print("wrote", OUT, top.size)
print("wrote transparent", OUT_CIRCLE, OUT_SWALLOW, OUT_SWALLOW_R, OUT_CIRCLE_R)
print("wrote", OUT_META)
