from PIL import Image
from pathlib import Path
import math

p = Path(
    r"C:\Users\16152\.cursor\projects\d-D-attic\assets\c__Users_16152_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_f87d60e69498aa0d23a498d692ca2341-7089ee6b-9dab-49cf-b1a2-03f397eee9af.png"
)
im = Image.open(p).convert("RGB")
w, h = im.size
px = im.load()


def is_ink(x, y):
    r, g, b = px[x, y]
    return not (r > 240 and g > 240 and b > 240)


xs, ys = [], []
for y in range(h):
    for x in range(w):
        if is_ink(x, y):
            xs.append(x)
            ys.append(y)
x0, x1 = min(xs), max(xs)
y0, y1 = min(ys), max(ys)
cx = (x0 + x1) / 2
cy = (y0 + y1) / 2
print("bounds", x0, y0, x1, y1)
print("center", cx, cy)

sx, sy = int(round(cx)), int(round(cy))
half = 0
for hh in range(5, 120):
    ok = True
    for y in range(sy - hh, sy + hh + 1):
        for x in range(sx - hh, sx + hh + 1):
            if not is_ink(x, y):
                ok = False
                break
        if not ok:
            break
    if not ok:
        half = hh - 1
        break
print("square half", half, "side", half * 2 + 1)


def tip_radius(ang_deg):
    rad = math.radians(ang_deg)
    dx, dy = math.cos(rad), math.sin(rad)
    last = 0
    for r in range(0, 600):
        x = int(round(cx + dx * r))
        y = int(round(cy + dy * r))
        if 0 <= x < w and 0 <= y < h and is_ink(x, y):
            last = r
        elif last > 20:
            found = False
            for g in range(1, 12):
                xx = int(round(cx + dx * (r + g)))
                yy = int(round(cy + dy * (r + g)))
                if 0 <= xx < w and 0 <= yy < h and is_ink(xx, yy):
                    found = True
                    break
            if not found:
                break
    return last


def segments_along(ang):
    rad = math.radians(ang)
    dx, dy = math.cos(rad), math.sin(rad)
    segs = []
    in_seg = False
    start = 0
    for r in range(0, 600):
        x = int(round(cx + dx * r))
        y = int(round(cy + dy * r))
        on = 0 <= x < w and 0 <= y < h and is_ink(x, y)
        if on and not in_seg:
            in_seg = True
            start = r
        elif not on and in_seg:
            in_seg = False
            segs.append((start, r - 1))
    if in_seg:
        segs.append((start, 599))
    return segs


for a in range(0, 360, 45):
    print(f"tip {a:3d}: {tip_radius(a)}  segs={segments_along(a)}")

S = max(x1 - x0 + 1, y1 - y0 + 1)
print("S", S)
print("square half norm", half / S * 100)
print("cardinal tip", tip_radius(0) / S * 100)
print("diag tip", tip_radius(45) / S * 100)
