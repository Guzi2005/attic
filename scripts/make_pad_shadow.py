# -*- coding: utf-8 -*-
"""Build a slightly inset pad-shadow path with coherent rounded corners."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(r"D:\D盘桌面\attic")
IMG = ROOT / "public" / "center-illustration.png"
REGIONS = ROOT / "public" / "illustration-regions.json"
PREVIEW = ROOT / "assets" / "pad-shadow-preview.png"


def rounded_rect_path(x0: float, y0: float, x1: float, y1: float, r: float) -> str:
    """Clockwise rounded rect using cubic approximations."""
    r = min(r, (x1 - x0) / 2, (y1 - y0) / 2)
    # kappa for quarter-circle approx
    k = 0.5522847498 * r
    return " ".join(
        [
            f"M {x0 + r:.2f} {y0:.2f}",
            f"L {x1 - r:.2f} {y0:.2f}",
            f"C {x1 - r + k:.2f} {y0:.2f} {x1:.2f} {y0 + r - k:.2f} {x1:.2f} {y0 + r:.2f}",
            f"L {x1:.2f} {y1 - r:.2f}",
            f"C {x1:.2f} {y1 - r + k:.2f} {x1 - r + k:.2f} {y1:.2f} {x1 - r:.2f} {y1:.2f}",
            f"L {x0 + r:.2f} {y1:.2f}",
            f"C {x0 + r - k:.2f} {y1:.2f} {x0:.2f} {y1 - r + k:.2f} {x0:.2f} {y1 - r:.2f}",
            f"L {x0:.2f} {y0 + r:.2f}",
            f"C {x0:.2f} {y0 + r - k:.2f} {x0 + r - k:.2f} {y0:.2f} {x0 + r:.2f} {y0:.2f}",
            "Z",
        ]
    )


def main() -> None:
    im = Image.open(IMG).convert("RGBA")
    w, h = im.size
    alpha = im.split()[-1]

    # smooth content footprint (no pokey silhouette tips)
    mask = alpha.point(lambda a: 255 if a > 24 else 0)
    for _ in range(6):
        mask = mask.filter(ImageFilter.MinFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(8))
    mask = mask.point(lambda a: 255 if a > 120 else 0)

    bbox = mask.getbbox()
    if not bbox:
        raise SystemExit("empty mask")
    x0, y0, x1, y1 = bbox

    reg = json.loads(REGIONS.read_text(encoding="utf-8"))
    cx, cy = reg["centerLocal"]

    # inset toward center ~7%
    inset = 0.93
    x0 = cx + (x0 - cx) * inset
    y0 = cy + (y0 - cy) * inset
    x1 = cx + (x1 - cx) * inset
    y1 = cy + (y1 - cy) * inset

    # coherent rounded corners — no sharp tips
    r = min(x1 - x0, y1 - y0) * 0.11
    d = rounded_rect_path(x0, y0, x1, y1, r)
    reg["padShadowPath"] = d
    REGIONS.write_text(json.dumps(reg, ensure_ascii=False, indent=2), encoding="utf-8")

    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    prev = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(prev)
    draw.rectangle([x0, y0, x1, y1], fill=(90, 92, 110, 150))
    prev.save(PREVIEW)
    print(f"pad rounded rect r={r:.1f} → {REGIONS.name}")


if __name__ == "__main__":
    main()
