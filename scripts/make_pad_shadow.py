# -*- coding: utf-8 -*-
"""Inset illustration silhouette by N pixels → fixed front-light pad shadow PNG."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(r"D:\D盘桌面\attic")
IMG = ROOT / "public" / "center-illustration.png"
OUT = ROOT / "public" / "parts" / "illu-pad-shadow.png"
REGIONS = ROOT / "public" / "illustration-regions.json"
PREVIEW = ROOT / "assets" / "pad-shadow-preview.png"

# shrink footprint by ~this many pixels (MinFilter 3 ≈ 1px/pass)
ERODE_PASSES = 10
SHADOW_RGB = (88, 90, 108)


def main() -> None:
    im = Image.open(IMG).convert("RGBA")
    w, h = im.size
    alpha = im.split()[-1].point(lambda a: 255 if a > 28 else 0)

    for _ in range(ERODE_PASSES):
        alpha = alpha.filter(ImageFilter.MinFilter(3))

    # soft re-threshold: kill pokey 1px spikes, keep hard edge
    alpha = alpha.filter(ImageFilter.MaxFilter(3))
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    alpha = alpha.point(lambda a: 255 if a > 160 else 0)

    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px_a = alpha.load()
    px_s = shadow.load()
    for y in range(h):
        for x in range(w):
            if px_a[x, y] > 0:
                px_s[x, y] = (*SHADOW_RGB, 255)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    shadow.save(OUT)
    shadow.save(PREVIEW)

    reg = json.loads(REGIONS.read_text(encoding="utf-8"))
    reg["padShadowImage"] = "parts/illu-pad-shadow.png"
    reg["padShadowInsetPx"] = ERODE_PASSES
    # drop old rounded path so runtime won't use it
    reg.pop("padShadowPath", None)
    REGIONS.write_text(json.dumps(reg, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} (erode≈{ERODE_PASSES}px) + updated regions json")


if __name__ == "__main__":
    main()
