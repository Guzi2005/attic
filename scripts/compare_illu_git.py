# -*- coding: utf-8 -*-
import io
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(r"D:\D盘桌面\attic")
out = ROOT / "assets" / "illu-restore"
out.mkdir(exist_ok=True)

for rev, label in [("62cb891", "initial"), ("3ad0ccf", "latest")]:
    for path in [
        "public/center-illustration.png",
        "assets/cropped/center-illustration.png",
    ]:
        try:
            data = subprocess.check_output(["git", "show", f"{rev}:{path}"], cwd=ROOT)
        except subprocess.CalledProcessError:
            continue
        dest = out / f"{label}-{path.replace('/', '_')}"
        dest.write_bytes(data)
        im = Image.open(io.BytesIO(data)).convert("RGBA")
        print(label, path, im.size, dest.name)
        # sample chin zone: look for green vs gray
        w, h = im.size
        px = im.load()
        greens = grays = 0
        for y in range(int(h * 0.52), int(h * 0.68)):
            for x in range(int(w * 0.42), int(w * 0.58)):
                r, g, b, a = px[x, y]
                if a < 40:
                    continue
                if g > r + 20 and g > b + 10:
                    greens += 1
                elif abs(r - g) < 15 and abs(g - b) < 15 and r > 170:
                    grays += 1
        print("  chin-zone greens", greens, "light-grays", grays)
        break
