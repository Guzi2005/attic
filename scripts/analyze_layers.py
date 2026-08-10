from PIL import Image
import json
from pathlib import Path

raw = Path(r"D:\D盘桌面\attic\assets\raw")
results = []

for p in sorted(raw.glob("*.png")):
    im = Image.open(p)
    w, h = im.size
    mode = im.mode
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    px = im.load()
    minx, miny, maxx, maxy = w, h, -1, -1
    colors = {}
    step = max(1, min(w, h) // 200)
    content_count = 0
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            if r < 8 and g < 8 and b < 8:
                continue
            content_count += 1
            if x < minx:
                minx = x
            if y < miny:
                miny = y
            if x > maxx:
                maxx = x
            if y > maxy:
                maxy = y
            key = (r // 16 * 16, g // 16 * 16, b // 16 * 16)
            colors[key] = colors.get(key, 0) + 1

    if maxx >= 0:
        minx2, miny2, maxx2, maxy2 = w, h, -1, -1
        pad = 8
        for y in range(max(0, miny - pad), min(h, maxy + pad + 1)):
            for x in range(max(0, minx - pad), min(w, maxx + pad + 1)):
                r, g, b, a = px[x, y]
                if a < 10:
                    continue
                if r < 8 and g < 8 and b < 8:
                    continue
                if x < minx2:
                    minx2 = x
                if y < miny2:
                    miny2 = y
                if x > maxx2:
                    maxx2 = x
                if y > maxy2:
                    maxy2 = y
        if maxx2 >= 0:
            minx, miny, maxx, maxy = minx2, miny2, maxx2, maxy2

    top_colors = sorted(colors.items(), key=lambda kv: -kv[1])[:6]
    results.append(
        {
            "file": p.name,
            "size": [w, h],
            "mode": mode,
            "bbox": None if maxx < 0 else [minx, miny, maxx, maxy],
            "bbox_wh": None if maxx < 0 else [maxx - minx + 1, maxy - miny + 1],
            "content_samples": content_count,
            "top_colors": [{"rgb": list(c), "n": n} for c, n in top_colors],
            "bytes": p.stat().st_size,
        }
    )

out = Path(r"D:\D盘桌面\attic\assets\layer_analysis.json")
out.write_text(json.dumps(results, indent=2), encoding="utf-8")
print(f"analyzed {len(results)} files")
for r in results:
    bb = r["bbox"]
    cols = ",".join([str(c["rgb"]) for c in r["top_colors"][:3]])
    short = r["file"][-48:]
    print(f"{short} | {r['size']} | bbox={bb} | samples={r['content_samples']} | {cols}")
