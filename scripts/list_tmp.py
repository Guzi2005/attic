# -*- coding: utf-8 -*-
from pathlib import Path
from PIL import Image
import json
import shutil

src = Path(r"D:\D盘桌面\tmp")
named = Path(r"D:\D盘桌面\attic\assets\full")
named.mkdir(parents=True, exist_ok=True)

# Write raw inventory with real unicode names
inventory = []
for f in sorted(src.glob("*.png")):
    im = Image.open(f)
    inventory.append({"name": f.name, "size": list(im.size), "mode": im.mode, "bytes": f.stat().st_size})

Path(r"D:\D盘桌面\attic\assets\tmp_inventory.json").write_text(
    json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8"
)
print("inventory written", len(inventory))
for item in inventory:
    print(item["name"])
