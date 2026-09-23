# -*- coding: utf-8 -*-
"""Generate drafting-paper style portfolio cover placeholders (no nested card chrome)."""
from pathlib import Path
import math
import random
from PIL import Image, ImageDraw, ImageFont

OUT = Path(r"D:/D盘桌面/attic/public/parts/portfolio")
OUT.mkdir(parents=True, exist_ok=True)

SIZE = 720
PAPER = (243, 239, 228)
INK = (18, 18, 18)
LINE = (18, 18, 18, 46)

WORKS = [
    ("irisvista", "IV", (92, 118, 148), "IrisVista"),
    ("tenennium", "榫", (110, 92, 74), "Tenon"),
    ("prismify", "PR", (70, 78, 88), "Prismify"),
    ("multi-highlight", "MH", (58, 96, 86), "Highlight"),
    ("sunflower", "向", (168, 126, 52), "Sunflower"),
    ("dayflow", "DF", (86, 86, 102), "Dayflow"),
    ("weave", "WW", (74, 108, 92), "Weave"),
    ("ocr", "OCR", (98, 82, 92), "OCR"),
    ("stamp", "印", (122, 72, 68), "Stamp"),
]


def make_cover(slug, initials, accent, label):
    rng = random.Random(hash(slug) & 0xFFFFFFFF)
    img = Image.new("RGB", (SIZE, SIZE), PAPER)
    draw = ImageDraw.Draw(img, "RGBA")

    # grid
    step = 24
    for x in range(0, SIZE, step):
        draw.line([(x, 0), (x, SIZE)], fill=LINE, width=1)
    for y in range(0, SIZE, step):
        draw.line([(0, y), (SIZE, y)], fill=LINE, width=1)

    # outer frame
    draw.rectangle([18, 18, SIZE - 19, SIZE - 19], outline=INK + (180,), width=2)

    # accent band (top third) with stipple
    band = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(band)
    bdraw.rectangle([42, 42, SIZE - 43, int(SIZE * 0.58)], fill=accent + (235,))
    for _ in range(2800):
        x = rng.randint(42, SIZE - 43)
        y = rng.randint(42, int(SIZE * 0.58))
        if rng.random() < 0.55:
            bdraw.point((x, y), fill=(255, 255, 255, 70))
        else:
            bdraw.point((x, y), fill=(0, 0, 0, 55))
    img = Image.alpha_composite(img.convert("RGBA"), band)

    draw = ImageDraw.Draw(img, "RGBA")

    # diagonal hatch in lower area
    for i in range(-SIZE, SIZE * 2, 14):
        draw.line([(i, int(SIZE * 0.62)), (i + 120, SIZE - 36)], fill=(18, 18, 18, 28), width=1)

    # initials
    try:
        font = ImageFont.truetype("arial.ttf", 96)
        font_s = ImageFont.truetype("arial.ttf", 28)
    except OSError:
        font = ImageFont.load_default()
        font_s = font

    # measure
    try:
        bbox = draw.textbbox((0, 0), initials, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    except AttributeError:
        tw, th = draw.textsize(initials, font=font)
    tx = (SIZE - tw) // 2
    ty = int(SIZE * 0.28) - th // 2
    draw.text((tx + 2, ty + 2), initials, fill=(0, 0, 0, 60), font=font)
    draw.text((tx, ty), initials, fill=(255, 255, 255, 230), font=font)

    # small mono label bottom-left inside frame
    draw.text((48, SIZE - 78), label.upper(), fill=INK + (200,), font=font_s)
    draw.text((48, SIZE - 48), "ATTIC / DRAFT", fill=INK + (120,), font=font_s)

    # corner ticks
    for cx, cy in [(42, 42), (SIZE - 43, 42), (42, SIZE - 43), (SIZE - 43, SIZE - 43)]:
        draw.line([(cx - 10, cy), (cx + 10, cy)], fill=INK, width=2)
        draw.line([(cx, cy - 10), (cx, cy + 10)], fill=INK, width=2)

    out = OUT / f"{slug}.png"
    img.convert("RGB").save(out, "PNG", optimize=True)
    print("wrote", out.name)


def main():
    for slug, initials, accent, label in WORKS:
        make_cover(slug, initials, accent, label)


if __name__ == "__main__":
    main()
