# -*- coding: utf-8 -*-
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(r"D:\D盘桌面\attic")
SRC = ROOT / "public" / "home-quilt-mock.png"
OUT = ROOT / "public" / "parts" / "bento"
OUT.mkdir(parents=True, exist_ok=True)

im = Image.open(SRC).convert("RGB")
w, h = im.size
arr = im.load()

# mean abs vertical/horizontal gradient per line
row_score = []
for y in range(1, h):
    s = 0
    for x in range(0, w, 4):
        a = arr[x, y]
        b = arr[x, y - 1]
        s += abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])
    row_score.append(s)

col_score = []
for x in range(1, w):
    s = 0
    for y in range(0, h, 4):
        a = arr[x, y]
        b = arr[x - 1, y]
        s += abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])
    col_score.append(s)


def peaks(scores, min_gap=22, edge=12):
    thr = sorted(scores)[int(len(scores) * 0.90)]
    cand = [i + 1 for i, v in enumerate(scores) if v >= thr]
    kept = []
    for i in cand:
        if i < edge or i > len(scores) - edge:
            continue
        lo = max(0, i - 8)
        hi = min(len(scores), i + 7)
        if scores[i - 1] < max(scores[lo:hi]) * 0.97:
            continue
        if kept and i - kept[-1] < min_gap:
            if scores[i - 1] > scores[kept[-1] - 1]:
                kept[-1] = i
            continue
        kept.append(i)
    return kept


ys = [0] + peaks(row_score) + [h]
xs = [0] + peaks(col_score, min_gap=20) + [w]


def uniq(vals, gap=12):
    out = []
    for v in vals:
        if out and abs(v - out[-1]) < gap:
            out[-1] = (out[-1] + v) // 2
        else:
            out.append(int(v))
    return out


ys, xs = uniq(ys), uniq(xs)
print("xs", xs)
print("ys", ys)

dbg = im.copy()
d = ImageDraw.Draw(dbg)
for x in xs:
    d.line([(x, 0), (x, h)], fill=(255, 0, 0), width=2)
for y in ys:
    d.line([(0, y), (w, y)], fill=(0, 100, 255), width=2)
dbg.save(OUT / "_grid-debug.png")
print("debug", OUT / "_grid-debug.png")
