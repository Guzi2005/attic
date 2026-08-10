# -*- coding: utf-8 -*-
"""Identify each full-res layer by content and copy to English names."""
from pathlib import Path
from PIL import Image
import json
import shutil

src = Path(r"D:\D盘桌面\tmp")
out_dir = Path(r"D:\D盘桌面\attic\assets\full")
out_dir.mkdir(parents=True, exist_ok=True)

def analyze(path: Path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    step = 8
    minx, miny, maxx, maxy = w, h, -1, -1
    colors = {}
    content = 0
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b, a = px[x, y]
            if a < 12:
                continue
            content += 1
            if x < minx: minx = x
            if y < miny: miny = y
            if x > maxx: maxx = x
            if y > maxy: maxy = y
            # classify hue buckets
            mx = max(r, g, b)
            mn = min(r, g, b)
            if mx < 40:
                bucket = "near_black"
            elif g > r + 25 and g > b + 10:
                bucket = "green"
            elif r > 120 and b > 80 and r > g + 20:
                bucket = "magenta"
            elif abs(r - g) < 25 and abs(g - b) < 25 and r > 140:
                bucket = "lavender"
            elif abs(r - g) < 20 and abs(g - b) < 20 and r < 90:
                bucket = "dark_gray"
            else:
                bucket = "other"
            colors[bucket] = colors.get(bucket, 0) + 1
    bbox = None if maxx < 0 else [minx, miny, maxx, maxy]
    return {
        "name": path.name,
        "bytes": path.stat().st_size,
        "bbox": bbox,
        "content": content,
        "colors": colors,
        "cx": None if not bbox else (bbox[0] + bbox[2]) / 2,
        "cy": None if not bbox else (bbox[1] + bbox[3]) / 2,
    }

rows = [analyze(p) for p in sorted(src.glob("*.png"))]
Path(r"D:\D盘桌面\attic\assets\tmp_id.json").write_text(
    json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
)

# Heuristic naming based on colors + position + size
def pick_name(r):
    bb = r["bbox"]
    if not bb:
        return "unknown"
    x0, y0, x1, y1 = bb
    w, h = x1 - x0, y1 - y0
    cx, cy = r["cx"], r["cy"]
    c = r["colors"]
    green = c.get("green", 0)
    magenta = c.get("magenta", 0)
    dark = c.get("dark_gray", 0) + c.get("near_black", 0)
    lavender = c.get("lavender", 0)
    other = c.get("other", 0)
    area = w * h

    # large colorful center illustration
    if other > 800 and 900 < cx < 1900 and 400 < cy < 1200 and area > 400000:
        return "center-illustration"
    # outline/grid: full-ish span, mostly dark lines
    if w > 2500 and h > 1600 and dark > other and green < 50 and magenta < 50:
        return "outline"
    # green pin: small, green, top-leftish
    if green > 30 and magenta < 10 and cy < 500 and cx < 1200 and area < 120000:
        return "pin-green"
    # magenta pin
    if magenta > 30 and green < 10 and cy < 500 and cx > 1600 and area < 120000:
        return "pin-magenta"
    # green underline
    if green > 40 and magenta < 15 and 600 < cy < 1100 and cx < 1200 and h < 400:
        return "underline-green"
    # magenta underline (+x)
    if magenta > 40 and green < 15 and 600 < cy < 1100 and cx > 1600 and h < 400:
        return "underline-magenta"
    # left arrow
    if lavender > 10 and cy > 1500 and cx < 900 and area < 80000:
        return "arrow-left"
    # right arrow
    if lavender > 10 and cy > 1500 and cx > 2000 and area < 80000:
        return "arrow-right"
    # checklist marks (small, bottom center, green+magenta)
    if cy > 1400 and 1100 < cx < 1600 and area < 150000 and (green > 5 or magenta > 5) and w < 200:
        return "checklist-marks"
    # checklist text
    if dark > 50 and cy > 1450 and 1200 < cx < 1900 and h < 350 and w > 400:
        return "checklist-text"
    # reason title
    if dark > 30 and 1350 < cy < 1550 and 1200 < cx < 1800 and h < 150:
        return "text-reason"
    # you're now at
    if dark > 40 and cy < 450 and 1000 < cx < 1900 and w > 500:
        return "text-youre-now-at"
    # left domain text
    if dark > 80 and cx < 1000 and 400 < cy < 1300 and h > 600:
        return "text-left-fluorescent"
    # right domain text
    if dark > 80 and cx > 1900 and 400 < cy < 1300 and h > 600:
        return "text-right-florescent"
    return f"unknown-{path_safe(r['name'])}"

def path_safe(s):
    return "".join(ch if ch.isalnum() else "_" for ch in s)[:40]

mapping = {}
used = set()
for r in rows:
    name = pick_name(r)
    if name in used:
        name = name + "-dup"
    used.add(name)
    mapping[r["name"]] = name
    src_path = src / r["name"]
    dst = out_dir / f"{name}.png"
    shutil.copy2(src_path, dst)
    print(f"{r['name']} -> {name}.png | bbox={r['bbox']} colors={r['colors']}")

Path(r"D:\D盘桌面\attic\assets\name_map.json").write_text(
    json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8"
)
print("done", len(mapping))
