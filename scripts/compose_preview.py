# -*- coding: utf-8 -*-
"""Composite a flat preview from cropped parts + layout JSON for visual QA."""
from pathlib import Path
from PIL import Image
import json

ROOT = Path(r"D:\D盘桌面\attic")
layout = json.loads((ROOT / "public" / "cover-layout.json").read_text(encoding="utf-8"))
AW, AH = layout["meta"]["artboard"]["w"], layout["meta"]["artboard"]["h"]
canvas = Image.new("RGBA", (AW, AH), (0xDE, 0xE1, 0xF6, 255))

order = [
    "outline",
    "text-youre-now-at",
    "center-illustration",
    "text-reason",
    "checklist-text",
    "checklist-marks",
    "text-left-fluorescent",
    "text-right-florescent",
    "arrow-left",
    "arrow-right",
    "pin-green",
    "pin-magenta",
    "underline-green",
    "underline-magenta",
]

for name in order:
    place = layout["placements"][name]
    if name in ("outline", "center-illustration"):
        path = ROOT / "public" / f"{name}.png"
    else:
        path = ROOT / "public" / "parts" / f"{name}.png"
    layer = Image.open(path).convert("RGBA")
    # ensure size matches placement
    if layer.size != (place["w"], place["h"]):
        layer = layer.resize((place["w"], place["h"]), Image.Resampling.LANCZOS)
    canvas.alpha_composite(layer, (place["x"], place["y"]))
    print(name, place["x"], place["y"], layer.size)

out = ROOT / "assets" / "compose-preview.png"
# save a half-res preview for quick viewing
preview = canvas.resize((AW // 2, AH // 2), Image.Resampling.LANCZOS)
preview.save(out)
print("wrote", out, preview.size)
