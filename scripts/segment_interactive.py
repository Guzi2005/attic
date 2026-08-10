# -*- coding: utf-8 -*-
"""Segment letter glyphs and checklist marks; trace illustration diagonals."""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw
import json

ROOT = Path(r"D:\D盘桌面\attic")
CROPPED = ROOT / "assets" / "cropped"
PUBLIC = ROOT / "public"
PARTS = PUBLIC / "parts"
LAYOUT = json.loads((PUBLIC / "cover-layout.json").read_text(encoding="utf-8"))


def alpha_bbox_cols(im: Image.Image, thresh=20):
    a = im.split()[-1]
    w, h = im.size
    px = a.load()
    cols = []
    for x in range(w):
        hit = any(px[x, y] > thresh for y in range(h))
        cols.append(hit)
    return cols


def segments_from_mask(mask, min_gap=3, min_w=6):
    """Return list of (x0, x1) inclusive runs where mask is True."""
    segs = []
    i = 0
    n = len(mask)
    while i < n:
        if not mask[i]:
            i += 1
            continue
        j = i
        while j < n and mask[j]:
            j += 1
        if j - i >= min_w:
            segs.append((i, j - 1))
        i = j
    return segs


def merge_close(segs, gap=4):
    if not segs:
        return []
    out = [segs[0]]
    for a, b in segs[1:]:
        pa, pb = out[-1]
        if a - pb <= gap:
            out[-1] = (pa, b)
        else:
            out.append((a, b))
    return out


def crop_letter_strip(im: Image.Image, x0, x1, pad=2):
    w, h = im.size
    # tighten vertical bbox inside column
    px = im.load()
    miny, maxy = h, -1
    for y in range(h):
        for x in range(x0, x1 + 1):
            if px[x, y][3] > 20:
                if y < miny:
                    miny = y
                if y > maxy:
                    maxy = y
    if maxy < 0:
        return None, None
    bx0 = max(0, x0 - pad)
    by0 = max(0, miny - pad)
    bx1 = min(w, x1 + pad + 1)
    by1 = min(h, maxy + pad + 1)
    return im.crop((bx0, by0, bx1, by1)), (bx0, by0, bx1 - bx0, by1 - by0)


def segment_title_letters():
    """Split YOU'RE NOW AT into individual letter PNGs."""
    place = LAYOUT["placements"]["text-youre-now-at"]
    im = Image.open(CROPPED / "text-youre-now-at.png").convert("RGBA")
    w, h = im.size
    # Split into two rows by horizontal projection
    px = im.load()
    rows = []
    for y in range(h):
        rows.append(any(px[x, y][3] > 20 for x in range(w)))
    # find two bands
    bands = []
    y = 0
    while y < h:
        if not rows[y]:
            y += 1
            continue
        y1 = y
        while y1 < h and rows[y1]:
            y1 += 1
        bands.append((y, y1 - 1))
        y = y1
    # merge tiny gaps
    merged = []
    for a, b in bands:
        if merged and a - merged[-1][1] < 20:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    print("title bands", merged)

    out_dir = PARTS / "letters"
    out_dir.mkdir(parents=True, exist_ok=True)
    letters = []
    labels_row0 = list("YOU'RE NOW")  # includes space — skip empty
    # Actually spaces won't appear as segments. Labels by order:
    # YOU'RE NOW = Y O U ' R E N O W (apostrophe as glyph)
    # AT = A T
    expected = [
        "Y", "O", "U", "apos", "R", "E", "N", "O2", "W",  # row0 — wait NOW is separate
    ]
    # Better: detect all column segments per band and assign known string
    row_strings = ["YOU'RE NOW", "AT"]

    idx = 0
    for bi, (ry0, ry1) in enumerate(merged[:2]):
        row = im.crop((0, ry0, w, ry1 + 1))
        cols = alpha_bbox_cols(row)
        segs = merge_close(segments_from_mask(cols, min_w=4), gap=6)
        # Filter out very thin noise
        segs = [(a, b) for a, b in segs if b - a >= 4]
        text = row_strings[bi] if bi < len(row_strings) else ""
        # Build label list skipping spaces
        labels = [ch if ch != " " else None for ch in text]
        labels = [ch for ch in labels if ch is not None]
        # Map apostrophe
        labels = ["apos" if ch == "'" else ch for ch in labels]
        print(f"row{bi} segs={len(segs)} labels={labels}")
        # If count mismatch, still export by index
        for si, (sx0, sx1) in enumerate(segs):
            glyph, local = crop_letter_strip(row, sx0, sx1, pad=3)
            if glyph is None:
                continue
            lx, ly, lw, lh = local
            # artboard coords
            ax = place["x"] + lx
            ay = place["y"] + ry0 + ly
            name = labels[si] if si < len(labels) else f"g{idx}"
            # uniquify duplicate letters
            fname = f"{idx:02d}-{name}.png"
            glyph.save(out_dir / fname)
            letters.append(
                {
                    "id": f"letter-{idx}",
                    "file": f"parts/letters/{fname}",
                    "char": name,
                    "x": ax,
                    "y": ay,
                    "w": lw,
                    "h": lh,
                }
            )
            idx += 1

    meta = {"artboard": LAYOUT["meta"]["artboard"], "letters": letters}
    (PUBLIC / "letters.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("letters", len(letters))
    return letters


def segment_marks():
    place = LAYOUT["placements"]["checklist-marks"]
    im = Image.open(CROPPED / "checklist-marks.png").convert("RGBA")
    w, h = im.size
    px = im.load()
    rows = [any(px[x, y][3] > 20 for x in range(w)) for y in range(h)]
    bands = []
    y = 0
    while y < h:
        if not rows[y]:
            y += 1
            continue
        y1 = y
        while y1 < h and rows[y1]:
            y1 += 1
        bands.append((y, y1 - 1))
        y = y1
    merged = []
    for a, b in bands:
        if merged and a - merged[-1][1] < 12:
            merged[-1] = (merged[-1][0], b)
        else:
            if b - a >= 8:
                merged.append((a, b))
    print("mark bands", merged)
    out_dir = PARTS / "marks"
    out_dir.mkdir(parents=True, exist_ok=True)
    names = ["check-1", "check-2", "cross"]
    marks = []
    for i, (ry0, ry1) in enumerate(merged[:3]):
        # horizontal tighten
        minx, maxx = w, -1
        for yy in range(ry0, ry1 + 1):
            for xx in range(w):
                if px[xx, yy][3] > 20:
                    minx = min(minx, xx)
                    maxx = max(maxx, xx)
        pad = 4
        bx0, by0 = max(0, minx - pad), max(0, ry0 - pad)
        bx1, by1 = min(w, maxx + pad + 1), min(h, ry1 + pad + 1)
        crop = im.crop((bx0, by0, bx1, by1))
        name = names[i] if i < len(names) else f"mark-{i}"
        crop.save(out_dir / f"{name}.png")
        marks.append(
            {
                "id": name,
                "file": f"parts/marks/{name}.png",
                "x": place["x"] + bx0,
                "y": place["y"] + by0,
                "w": bx1 - bx0,
                "h": by1 - by0,
                "kind": "check" if i < 2 else "cross",
            }
        )
    (PUBLIC / "marks.json").write_text(
        json.dumps({"artboard": LAYOUT["meta"]["artboard"], "marks": marks}, indent=2),
        encoding="utf-8",
    )
    print("marks", marks)
    return marks


def trace_illustration_diagonals():
    """
    Trace the two diagonal dividers in the center illustration.
    Returns 4 triangle polygons in artboard coordinates + local SVG.
    """
    place = LAYOUT["placements"]["center-illustration"]
    im = Image.open(CROPPED / "center-illustration.png").convert("RGBA")
    w, h = im.size
    px = im.load()

    # Detect dark divider lines: near-black thin strokes inside illustration
    # Sample along potential diagonal corridors
    def is_divider(x, y):
        if x < 2 or y < 2 or x >= w - 2 or y >= h - 2:
            return False
        r, g, b, a = px[x, y]
        if a < 80:
            return False
        # dark gray/black line
        if r < 70 and g < 70 and b < 70:
            return True
        return False

    # Find center-ish intersection by densest dark cross
    best = None
    best_score = -1
    for cy in range(int(h * 0.35), int(h * 0.65), 2):
        for cx in range(int(w * 0.35), int(w * 0.65), 2):
            score = 0
            for t in range(-40, 41, 2):
                if is_divider(cx + t, cy + t):
                    score += 1
                if is_divider(cx + t, cy - t):
                    score += 1
            if score > best_score:
                best_score = score
                best = (cx, cy)
    cx, cy = best if best else (w // 2, h // 2)
    print("intersection", cx, cy, "score", best_score)

    def follow_diag(dx, dy, steps=600):
        pts = [(cx, cy)]
        x, y = float(cx), float(cy)
        for _ in range(steps):
            x += dx
            y += dy
            ix, iy = int(round(x)), int(round(y))
            if ix < 4 or iy < 4 or ix >= w - 4 or iy >= h - 4:
                pts.append((max(0, min(w - 1, ix)), max(0, min(h - 1, iy))))
                break
            # snap to nearest divider in small window
            found = None
            for rad in range(0, 6):
                for oy in range(-rad, rad + 1):
                    for ox in range(-rad, rad + 1):
                        if is_divider(ix + ox, iy + oy):
                            found = (ix + ox, iy + oy)
                            break
                    if found:
                        break
                if found:
                    break
            if found:
                x, y = found
                pts.append(found)
            else:
                pts.append((ix, iy))
        return pts

    # Four rays from center: NE, NW, SE, SW roughly along diagonals
    # Illustration diagonals: top-left↔bottom-right and top-right↔bottom-left
    ray_se = follow_diag(1.0, 1.0)
    ray_nw = follow_diag(-1.0, -1.0)
    ray_ne = follow_diag(1.0, -1.0)
    ray_sw = follow_diag(-1.0, 1.0)

    def simplify(pts, step=8):
        if len(pts) <= 2:
            return pts
        out = pts[::step]
        if out[-1] != pts[-1]:
            out.append(pts[-1])
        return out

    se, nw, ne, sw = map(simplify, (ray_se, ray_nw, ray_ne, ray_sw))

    # Corners of illustration local box
    tl, tr, br, bl = (0, 0), (w - 1, 0), (w - 1, h - 1), (0, h - 1)

    # Endpoints: where rays hit edges
    def edge_end(pts, fallback):
        return pts[-1] if pts else fallback

    # Triangles: top, right, bottom, left
    # Top: TL -> along top to TR -> back via NE/NW through center
    # Using corner + two ray ends on top? Better use:
    # Top triangle: top edge corners + center, clipped by NE and NW rays to top edge

    top_left_end = edge_end(nw, tl)
    top_right_end = edge_end(ne, tr)
    bot_left_end = edge_end(sw, bl)
    bot_right_end = edge_end(se, br)

    # Build polygons going around each sector
    # Top: from center along NW reverse to top-left edge, along top edge, back NE to center
    def reverse(pts):
        return list(reversed(pts))

    # Ensure rays start at center
    def ensure_center(pts):
        if not pts:
            return [(cx, cy)]
        if pts[0] != (cx, cy):
            return [(cx, cy)] + pts
        return pts

    se, nw, ne, sw = map(ensure_center, (se, nw, ne, sw))

    # Top triangle: center -> ne path to top -> along top leftward -> nw reverse to center
    # Actually top region is between NE and NW rays
    top_poly = [(cx, cy)] + ne[1:] + [tr, tl] + reverse(nw)[1:]
    # Right: between NE and SE
    right_poly = [(cx, cy)] + se[1:] + [br, tr] + reverse(ne)[1:]
    # Bottom: between SE and SW
    bottom_poly = [(cx, cy)] + sw[1:] + [bl, br] + reverse(se)[1:]
    # Left: between SW and NW
    left_poly = [(cx, cy)] + nw[1:] + [tl, bl] + reverse(sw)[1:]

    # The above may be wrong for corner inclusion. Cleaner approach:
    # Use only center + edge hits of the two diagonals + box corners in between.

    # Find which edge each ray hits
    def classify_edge(p):
        x, y = p
        if y <= 2:
            return "top"
        if y >= h - 3:
            return "bottom"
        if x <= 2:
            return "left"
        if x >= w - 3:
            return "right"
        # snap to nearest edge
        dists = {
            "top": y,
            "bottom": h - 1 - y,
            "left": x,
            "right": w - 1 - x,
        }
        return min(dists, key=dists.get)

    ends = {
        "se": (se[-1], classify_edge(se[-1])),
        "nw": (nw[-1], classify_edge(nw[-1])),
        "ne": (ne[-1], classify_edge(ne[-1])),
        "sw": (sw[-1], classify_edge(sw[-1])),
    }
    print("ray ends", ends)

    # Simpler 4 triangles using center + four edge endpoints (approx X division)
    # Top: center, nw_end snapped, ne_end snapped, with top corners if needed
    def poly_path(pts):
        return " ".join(f"{x},{y}" for x, y in pts)

    # Use classic X: corners of bounding box + center
    # But follow irregular diagonals for the cut edges
    top = [(cx, cy)] + reverse(nw)[1:] + [tl, tr] + ne[1:]
    # Wait - order matters for fill. Use:
    # top: center -> along NW to edge -> corners on top side -> along NE back
    # Determine corners between two edge hits along boundary clockwise

    corners_cw = [tl, tr, br, bl]

    def boundary_between(p_a, edge_a, p_b, edge_b, clockwise=True):
        """Walk rectangle boundary from p_a to p_b including corners."""
        order = ["top", "right", "bottom", "left"]
        corner_at = {
            ("top", "right"): tr,
            ("right", "bottom"): br,
            ("bottom", "left"): bl,
            ("left", "top"): tl,
        }
        # collect points along boundary
        pts = [p_a]
        if edge_a == edge_b:
            pts.append(p_b)
            return pts
        # move to next corners until reach edge_b
        ei = order.index(edge_a)
        for _ in range(4):
            edge_from = order[ei]
            edge_to = order[(ei + 1) % 4]
            pts.append(corner_at[(edge_from, edge_to)])
            if edge_to == edge_b:
                pts.append(p_b)
                return pts
            ei = (ei + 1) % 4
        pts.append(p_b)
        return pts

    def sector(ray_a, key_a, ray_b, key_b):
        # polygon: center + along ray_a to end + boundary to ray_b end + back ray_b reverse
        a_pts = ray_a
        b_pts = ray_b
        (pa, ea) = ends[key_a]
        (pb, eb) = ends[key_b]
        # Use last points of rays as pa/pb
        pa = a_pts[-1]
        pb = b_pts[-1]
        ea = classify_edge(pa)
        eb = classify_edge(pb)
        mid = boundary_between(pa, ea, pb, eb)
        poly = [(cx, cy)] + a_pts[1:] + mid[1:] + reverse(b_pts)[1:]
        return poly

    # Clockwise sectors from NW->NE (top), NE->SE (right), SE->SW (bottom), SW->NW (left)
    top_poly = sector(nw, "nw", ne, "ne")
    right_poly = sector(ne, "ne", se, "se")
    bottom_poly = sector(se, "se", sw, "sw")
    left_poly = sector(sw, "sw", nw, "nw")

    # If boundary_between walks wrong way, triangles may be huge — fallback to simple X
    def area(poly):
        a = 0
        for i in range(len(poly)):
            x1, y1 = poly[i]
            x2, y2 = poly[(i + 1) % len(poly)]
            a += x1 * y2 - x2 * y1
        return abs(a) / 2

    polys = {
        "top": top_poly,
        "right": right_poly,
        "bottom": bottom_poly,
        "left": left_poly,
    }
    for k, p in polys.items():
        print(k, "n=", len(p), "area=", int(area(p)), "img_area=", w * h)

    # Fallback if any sector absurdly large / small
    img_area = w * h
    if any(area(p) < img_area * 0.08 or area(p) > img_area * 0.55 for p in polys.values()):
        print("fallback to corner X")
        polys = {
            "top": [(cx, cy), tl, tr],
            "right": [(cx, cy), tr, br],
            "bottom": [(cx, cy), br, bl],
            "left": [(cx, cy), bl, tl],
        }
        # Still attach irregular diagonal as clip edges visually via denser points:
        polys = {
            "top": [(cx, cy)] + reverse(nw)[1:] + [tl] + [tr] + ne[1:],
            "right": [(cx, cy)] + ne[1:] + [tr] + [br] + reverse(se)[1:]
            if False
            else [(cx, cy)] + list(ne[1:]) + [tr, br] + reverse(se)[1:],
            "bottom": [(cx, cy)] + se[1:] + [br, bl] + reverse(sw)[1:],
            "left": [(cx, cy)] + sw[1:] + [bl, tl] + reverse(nw)[1:],
        }

    def to_artboard(poly):
        return [[place["x"] + x, place["y"] + y] for x, y in poly]

    def to_local_path(poly):
        if not poly:
            return ""
        d = [f"M {poly[0][0]} {poly[0][1]}"]
        for x, y in poly[1:]:
            d.append(f"L {x} {y}")
        d.append("Z")
        return " ".join(d)

    regions = []
    for name, poly in polys.items():
        # simplify
        simp = poly[:: max(1, len(poly) // 40)]
        if simp[-1] != poly[-1]:
            simp.append(poly[-1])
        regions.append(
            {
                "id": name,
                "localPath": to_local_path(simp),
                "artboardPolygon": to_artboard(simp),
            }
        )

    # Debug draw
    dbg = im.copy()
    draw = ImageDraw.Draw(dbg, "RGBA")
    colors = {
        "top": (255, 80, 80, 60),
        "right": (80, 255, 80, 60),
        "bottom": (80, 80, 255, 60),
        "left": (255, 255, 80, 60),
    }
    for r in regions:
        # parse path points roughly from artboard - use local
        # redraw from polys
        pass
    for name, poly in polys.items():
        if len(poly) >= 3:
            draw.polygon(poly, fill=colors[name], outline=(0, 0, 0, 200))
    dbg.save(ROOT / "assets" / "tri-debug.png")

    data = {
        "artboard": LAYOUT["meta"]["artboard"],
        "placement": place,
        "centerLocal": [cx, cy],
        "regions": regions,
        "diagonals": {
            "nw_se": to_artboard(reverse(nw)[1:] + se[1:]),
            "ne_sw": to_artboard(reverse(ne)[1:] + sw[1:]),
        },
    }
    (PUBLIC / "illustration-regions.json").write_text(
        json.dumps(data, indent=2), encoding="utf-8"
    )
    print("wrote illustration-regions.json")
    return data


if __name__ == "__main__":
    segment_title_letters()
    segment_marks()
    trace_illustration_diagonals()
