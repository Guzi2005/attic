# -*- coding: utf-8 -*-
"""Trace user-drawn blue X diagonals into illustration region clip paths."""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw
import json
import math

ROOT = Path(r"D:\D盘桌面\attic")
PUBLIC = ROOT / "public"
LAYOUT = json.loads((PUBLIC / "cover-layout.json").read_text(encoding="utf-8"))
AW, AH = 2880, 1920

GUIDE = Path(
    r"C:\Users\16152\.cursor\projects\d-D-attic\assets"
    r"\c__Users_16152_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
    r"_584babb61a2309067a9db49d00bd9f99-10516846-ff84-4271-8b5e-260f30869dca.png"
)


def is_blue(r, g, b, a=255):
    # vibrant blue guide on black
    return b > 80 and b > r + 30 and b > g + 20


def collect_blue(im: Image.Image):
    w, h = im.size
    px = im.load()
    pts = []
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if len(p) == 4:
                r, g, b, a = p
                if a < 40:
                    continue
            else:
                r, g, b = p[:3]
            if is_blue(r, g, b):
                pts.append((x, y))
    return pts


def to_artboard(pts, src_w, src_h):
    sx, sy = AW / src_w, AH / src_h
    return [(x * sx, y * sy) for x, y in pts]


def fit_line(pts):
    """PCA-ish: fit through mean along principal direction, return two endpoints."""
    if len(pts) < 2:
        return pts
    mx = sum(p[0] for p in pts) / len(pts)
    my = sum(p[1] for p in pts) / len(pts)
    # covariance
    sxx = sum((p[0] - mx) ** 2 for p in pts)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    syy = sum((p[1] - my) ** 2 for p in pts)
    # principal eigenvector of [[sxx,sxy],[sxy,syy]]
    trace = sxx + syy
    det = sxx * syy - sxy * sxy
    # largest eigenvalue
    gap = math.sqrt(max(0, trace * trace / 4 - det))
    l1 = trace / 2 + gap
    # (sxx - l1) vx + sxy vy = 0
    if abs(sxy) > 1e-6:
        vx, vy = sxy, l1 - sxx
    else:
        vx, vy = (1, 0) if sxx >= syy else (0, 1)
    norm = math.hypot(vx, vy) or 1
    vx, vy = vx / norm, vy / norm
    # project
    ts = [((p[0] - mx) * vx + (p[1] - my) * vy) for p in pts]
    t0, t1 = min(ts), max(ts)
    return [(mx + t0 * vx, my + t0 * vy), (mx + t1 * vx, my + t1 * vy)]


def sample_polyline_along_blue(pts, n=40):
    """Order blue points along principal axis and downsample."""
    if len(pts) < 2:
        return pts
    ends = fit_line(pts)
    mx = (ends[0][0] + ends[1][0]) / 2
    my = (ends[0][1] + ends[1][1]) / 2
    vx = ends[1][0] - ends[0][0]
    vy = ends[1][1] - ends[0][1]
    norm = math.hypot(vx, vy) or 1
    vx, vy = vx / norm, vy / norm
    ranked = sorted(pts, key=lambda p: (p[0] - mx) * vx + (p[1] - my) * vy)
    # bin
    out = []
    step = max(1, len(ranked) // n)
    for i in range(0, len(ranked), step):
        chunk = ranked[i : i + step]
        out.append(
            (
                sum(p[0] for p in chunk) / len(chunk),
                sum(p[1] for p in chunk) / len(chunk),
            )
        )
    if out[-1] != ranked[-1]:
        out.append(ranked[-1])
    return out


def cluster_two_diagonals(pts):
    """Split into NW-SE vs NE-SW by residual to y-x and y+x."""
    # For each point, classify by which diagonal family it belongs to
    # Use RANSAC-ish: points near line through center with slope +1 or -1
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    nwse, nesw = [], []
    for x, y in pts:
        # distance to (y - cy) = (x - cx)  → NW-SE in image coords (both increase)
        d1 = abs((y - cy) - (x - cx)) / math.sqrt(2)
        # distance to (y - cy) = -(x - cx) → NE-SW
        d2 = abs((y - cy) + (x - cx)) / math.sqrt(2)
        if d1 <= d2:
            nwse.append((x, y))
        else:
            nesw.append((x, y))
    return nwse, nesw, (cx, cy)


def line_intersect(a1, a2, b1, b2):
    x1, y1 = a1
    x2, y2 = a2
    x3, y3 = b1
    x4, y4 = b2
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-9:
        return ((x1 + x2 + x3 + x4) / 4, (y1 + y2 + y3 + y4) / 4)
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den
    return (px, py)


def clip_segment_to_rect(p0, p1, rect):
    """Liang-Barsky clip; return endpoints inside/on rect or None."""
    x_min, y_min, x_max, y_max = rect
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    p = [-dx, dx, -dy, dy]
    q = [x0 - x_min, x_max - x0, y0 - y_min, y_max - y0]
    u1, u2 = 0.0, 1.0
    for pi, qi in zip(p, q):
        if abs(pi) < 1e-12:
            if qi < 0:
                return None
            continue
        t = qi / pi
        if pi < 0:
            u1 = max(u1, t)
        else:
            u2 = min(u2, t)
        if u1 > u2:
            return None
    return (x0 + u1 * dx, y0 + u1 * dy), (x0 + u2 * dx, y0 + u2 * dy)


def edge_hit(p, rect, eps=1.5):
    x, y = p
    x0, y0, x1, y1 = rect
    if abs(y - y0) <= eps:
        return "top"
    if abs(y - y1) <= eps:
        return "bottom"
    if abs(x - x0) <= eps:
        return "left"
    if abs(x - x1) <= eps:
        return "right"
    # snap to nearest
    dists = {
        "top": abs(y - y0),
        "bottom": abs(y - y1),
        "left": abs(x - x0),
        "right": abs(x - x1),
    }
    return min(dists, key=dists.get)


def corners_between(edge_a, edge_b, rect, clockwise=True):
    x0, y0, x1, y1 = rect
    corners = {
        ("top", "right"): (x1, y0),
        ("right", "bottom"): (x1, y1),
        ("bottom", "left"): (x0, y1),
        ("left", "top"): (x0, y0),
    }
    order = ["top", "right", "bottom", "left"]
    if edge_a == edge_b:
        return []
    out = []
    i = order.index(edge_a)
    for _ in range(4):
        nxt = order[(i + 1) % 4]
        out.append(corners[(order[i], nxt)])
        if nxt == edge_b:
            return out
        i = (i + 1) % 4
    return out


def path_d(pts):
    parts = [f"M {pts[0][0]:.2f} {pts[0][1]:.2f}"]
    for x, y in pts[1:]:
        parts.append(f"L {x:.2f} {y:.2f}")
    parts.append("Z")
    return " ".join(parts)


def main():
    # Prefer full-res if user drops one later into assets/full
    full_guide = ROOT / "assets" / "full" / "diagonals.png"
    if full_guide.exists():
        guide_path = full_guide
    else:
        guide_path = GUIDE
        # save a copy for the project
        dst = ROOT / "assets" / "full" / "diagonals-chat.png"
        dst.parent.mkdir(parents=True, exist_ok=True)
        Image.open(GUIDE).save(dst)

    im = Image.open(guide_path).convert("RGBA")
    sw, sh = im.size
    print("guide", guide_path.name, sw, sh)

    blue = collect_blue(im)
    print("blue pixels", len(blue))
    blue_ab = to_artboard(blue, sw, sh)

    nwse, nesw, center_approx = cluster_two_diagonals(blue_ab)
    print("clusters", len(nwse), len(nesw), "center~", center_approx)

    line_a = sample_polyline_along_blue(nwse, n=48)  # roughly TL→BR
    line_b = sample_polyline_along_blue(nesw, n=48)  # roughly TR→BL
    # fit ends for intersection
    a_ends = fit_line(nwse)
    b_ends = fit_line(nesw)
    cx, cy = line_intersect(a_ends[0], a_ends[1], b_ends[0], b_ends[1])
    print("intersection", cx, cy)

    place = LAYOUT["placements"]["center-illustration"]
    rect = (place["x"], place["y"], place["x"] + place["w"], place["y"] + place["h"])
    print("illustration rect", rect)

    # Clip each diagonal to illustration rect
    a_clip = clip_segment_to_rect(a_ends[0], a_ends[1], rect)
    b_clip = clip_segment_to_rect(b_ends[0], b_ends[1], rect)
    if not a_clip or not b_clip:
        raise SystemExit("diagonals miss illustration bounds")

    # Identify which clipped end is which corner direction
    def classify_end(p):
        # relative to center
        return (
            "NW" if p[0] <= cx and p[1] <= cy else
            "NE" if p[0] > cx and p[1] <= cy else
            "SW" if p[0] <= cx and p[1] > cy else
            "SE"
        )

    a1, a2 = a_clip
    b1, b2 = b_clip
    ends = {
        classify_end(a1): a1,
        classify_end(a2): a2,
        classify_end(b1): b1,
        classify_end(b2): b2,
    }
    print("ends", {k: (round(v[0]), round(v[1])) for k, v in ends.items()})

    # Need NW, NE, SE, SW
    required = ["NW", "NE", "SE", "SW"]
    if not all(k in ends for k in required):
        # fallback: use rect corners projection of clipped ends
        print("WARN missing ends", ends.keys(), "— projecting to corners")
        x0, y0, x1, y1 = rect
        ends = {
            "NW": a1 if classify_end(a1) == "NW" else (a2 if classify_end(a2) == "NW" else (x0, y0)),
            "NE": b1 if classify_end(b1) == "NE" else (b2 if classify_end(b2) == "NE" else (x1, y0)),
            "SE": a1 if classify_end(a1) == "SE" else (a2 if classify_end(a2) == "SE" else (x1, y1)),
            "SW": b1 if classify_end(b1) == "SW" else (b2 if classify_end(b2) == "SW" else (x0, y1)),
        }
        # better: assign by classify from a_clip/b_clip
        ends = {}
        for p in (a1, a2, b1, b2):
            ends[classify_end(p)] = p
        for k, corner in [("NW", (x0, y0)), ("NE", (x1, y0)), ("SE", (x1, y1)), ("SW", (x0, y1))]:
            ends.setdefault(k, corner)

    # Build dense polylines from center to each end along sampled blue
    def ray_to(target):
        # pick points from both lines closer to this ray
        tx, ty = target[0] - cx, target[1] - cy
        pool = line_a + line_b
        scored = []
        for x, y in pool:
            dx, dy = x - cx, y - cy
            # same quadrant-ish & along ray
            if dx * tx + dy * ty <= 0:
                continue
            # distance to ray
            cross = abs(dx * ty - dy * tx) / (math.hypot(tx, ty) or 1)
            scored.append((cross, math.hypot(dx, dy), (x, y)))
        scored.sort()
        # take closest-to-ray points, order by distance from center
        near = [p for _, _, p in scored[: max(8, len(scored) // 3)]]
        near.sort(key=lambda p: math.hypot(p[0] - cx, p[1] - cy))
        poly = [(cx, cy)] + near
        # ensure end
        if poly[-1] != target:
            poly.append(target)
        return poly

    rays = {k: ray_to(ends[k]) for k in required}

    def sector(key_a, key_b):
        """Polygon: center → ray_a → boundary corners → back ray_b."""
        ra = rays[key_a]
        rb = rays[key_b]
        pa, pb = ra[-1], rb[-1]
        ea, eb = edge_hit(pa, rect), edge_hit(pb, rect)
        mid = corners_between(ea, eb, rect)
        # from center along ra, then mid corners, then reverse rb
        poly = list(ra)
        # add edge point pa already in ra; walk corners then to pb
        poly.extend(mid)
        if not mid or mid[-1] != pb:
            # include pb if not last
            if poly[-1] != pb:
                poly.append(pb)
        poly.extend(reversed(rb[:-1]))  # back to center without duplicating center end
        # dedupe consecutive
        out = [poly[0]]
        for p in poly[1:]:
            if abs(p[0] - out[-1][0]) > 0.5 or abs(p[1] - out[-1][1]) > 0.5:
                out.append(p)
        return out

    # Top: NW→NE, Right: NE→SE, Bottom: SE→SW, Left: SW→NW
    regions_ab = {
        "top": sector("NW", "NE"),
        "right": sector("NE", "SE"),
        "bottom": sector("SE", "SW"),
        "left": sector("SW", "NW"),
    }

    # Convert to local illustration coords
    ox, oy = place["x"], place["y"]

    def to_local(poly):
        return [(x - ox, y - oy) for x, y in poly]

    regions = []
    for name, poly in regions_ab.items():
        local = to_local(poly)
        # downsample a bit
        step = max(1, len(local) // 36)
        simp = local[::step]
        if simp[-1] != local[-1]:
            simp.append(local[-1])
        regions.append(
            {
                "id": name,
                "localPath": path_d(simp),
                "artboardPolygon": [[x + ox, y + oy] for x, y in simp],
            }
        )
        print(name, "pts", len(simp))

    data = {
        "artboard": {"w": AW, "h": AH},
        "placement": place,
        "centerLocal": [cx - ox, cy - oy],
        "centerArtboard": [cx, cy],
        "image": "center-illustration.png",
        "source": "user-diagonals",
        "regions": regions,
        "diagonals": {
            "nw_se": [[a_clip[0][0], a_clip[0][1]], [a_clip[1][0], a_clip[1][1]]],
            "ne_sw": [[b_clip[0][0], b_clip[0][1]], [b_clip[1][0], b_clip[1][1]]],
        },
    }
    (PUBLIC / "illustration-regions.json").write_text(
        json.dumps(data, indent=2), encoding="utf-8"
    )

    # debug
    dbg = Image.open(ROOT / "public" / "center-illustration.png").convert("RGBA")
    draw = ImageDraw.Draw(dbg, "RGBA")
    colors = {
        "top": (255, 60, 60, 80),
        "right": (60, 200, 60, 80),
        "bottom": (60, 60, 255, 80),
        "left": (220, 200, 40, 80),
    }
    for r in regions:
        # parse roughly from artboard - use local poly
        local = [(x - ox, y - oy) for x, y in r["artboardPolygon"]]
        if len(local) >= 3:
            draw.polygon([(int(x), int(y)) for x, y in local], fill=colors[r["id"]], outline=(0, 0, 0, 220))
    # draw diagonals in local
    for name, seg in data["diagonals"].items():
        p0 = (int(seg[0][0] - ox), int(seg[0][1] - oy))
        p1 = (int(seg[1][0] - ox), int(seg[1][1] - oy))
        draw.line([p0, p1], fill=(0, 180, 255, 255), width=3)
    icx, icy = int(cx - ox), int(cy - oy)
    draw.ellipse((icx - 5, icy - 5, icx + 5, icy + 5), fill=(255, 0, 255, 255))
    dbg.save(ROOT / "assets" / "tri-debug.png")
    print("wrote illustration-regions.json + tri-debug.png")
    print("NOTE: guide was chat-compressed; drop full-res as assets/full/diagonals.png to refine")


if __name__ == "__main__":
    main()
