"""True 1×3 herringbone: build axis-aligned L-joints, rotate 45°, seamless SVG pattern."""
from __future__ import annotations

import math
import re
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    Image = None

N = 3
W = 22.0  # smaller → denser boards on screen
L = N * W
S = math.sqrt(2)

# Minimal geometric cell after 45° rotation; color-period is a multiple so boards don't stripe.
CELL_X = W * S
CELL_Y = L * S
COLOR_NX = 4
COLOR_NY = 2
PERIOD_X = CELL_X * COLOR_NX
PERIOD_Y = CELL_Y * COLOR_NY

FILLS = [
    "#f0f2f6",
    "#d2d7e1",
    "#b4bcc9",
    "#9aa4b4",
    "#e4e7ee",
    "#c3cad5",
    "#a8b1bf",
    "#8f99a9",
]
BG = "#d5dae2"


def rot45(x: float, y: float) -> tuple[float, float]:
    return ((x - y) / S, (x + y) / S)


def aa_rect(cx: float, cy: float, ang: float) -> list[tuple[float, float]]:
    if ang == 0:  # horizontal L×W
        return [
            (cx - L / 2, cy - W / 2),
            (cx + L / 2, cy - W / 2),
            (cx + L / 2, cy + W / 2),
            (cx - L / 2, cy + W / 2),
        ]
    # vertical W×L
    return [
        (cx - W / 2, cy - L / 2),
        (cx + W / 2, cy - L / 2),
        (cx + W / 2, cy + L / 2),
        (cx - W / 2, cy + L / 2),
    ]


def edge_lens(pts: list[tuple[float, float]]) -> tuple[float, float]:
    d01 = math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
    d12 = math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1])
    return max(d01, d12), min(d01, d12)


def build_aa_planks() -> list[tuple[float, float, float]]:
    """Zigzag chain + (W,-W) columns — covers plane with exact 1×3 rectangles."""
    chain: list[tuple[float, float, float]] = []
    stack = [("H", 0.0, 0.0)]
    seen: set[tuple] = set()
    # Long chain; columns will replicate
    while stack and len(chain) < 24:
        t, x, y = stack.pop(0)
        key = (t, round(x, 3), round(y, 3))
        if key in seen:
            continue
        seen.add(key)
        if t == "H":
            chain.append((x + L / 2, y + W / 2, 0.0))
            stack.append(("V", x + L - W, y + W))
        else:
            chain.append((x + W / 2, y + L / 2, 90.0))
            stack.append(("H", x + W, y + L - W))

    out: list[tuple[float, float, float]] = []
    for i in range(-12, 16):
        ox, oy = i * W, -i * W
        for cx, cy, a in chain:
            out.append((cx + ox, cy + oy, a))
    return out


def build_period_planks() -> list[tuple[list[tuple[float, float]], int]]:
    px, py = PERIOD_X, PERIOD_Y

    def wrap(v: float, period: float) -> float:
        v = v % period
        if v < 0:
            v += period
        if v > period - 1e-6:
            v = 0.0
        return v

    uniq: list[tuple[list[tuple[float, float]], int]] = []
    seen: set[tuple] = set()
    for cx, cy, ang in build_aa_planks():
        rx, ry = rot45(cx, cy)
        cxw = wrap(rx, px)
        cyw = wrap(ry, py)
        key = (round(cxw, 1), round(cyw, 1), 0 if ang == 0 else 1)
        if key in seen:
            continue
        seen.add(key)
        pts_aa = aa_rect(cx, cy, ang)
        pts = []
        for x, y in pts_aa:
            qx, qy = rot45(x, y)
            pts.append((qx - rx + cxw, qy - ry + cyw))
        long_e, short_e = edge_lens(pts)
        ratio = long_e / max(short_e, 1e-6)
        if abs(ratio - N) > 0.08:
            raise SystemExit(f"bad ratio {ratio:.3f} key={key}")
        fi = (
            int(round(cxw / CELL_X)) * 3
            + int(round(cyw / CELL_Y)) * 5
            + key[2] * 7
        ) % len(FILLS)
        uniq.append((pts, int(fi)))
    return uniq


def poly(pts: list[tuple[float, float]]) -> str:
    return " ".join(f"{x:.2f},{y:.2f}" for x, y in pts)


def snippet_from(planks: list[tuple[list[tuple[float, float]], int]]) -> str:
    px, py = PERIOD_X, PERIOD_Y
    paths = [
        f'            <polygon points="{poly(pts)}" fill="{FILLS[fi]}"/>'
        for pts, fi in planks
    ]
    return f"""          <pattern
            id="attic-herringbone"
            width="{px:.3f}"
            height="{py:.3f}"
            patternUnits="userSpaceOnUse"
          >
            <rect width="{px:.3f}" height="{py:.3f}" fill="{BG}"/>
{chr(10).join(paths)}
          </pattern>"""


def main() -> None:
    planks = build_period_planks()
    px, py = PERIOD_X, PERIOD_Y
    area = len(planks) * L * W
    print(
        f"N={N} W={W} period={px:.1f}x{py:.1f} planks={len(planks)} "
        f"coverage={area / (px * py):.1%}"
    )
    for pts, _ in planks[:4]:
        long_e, short_e = edge_lens(pts)
        print(f"  ratio {long_e / short_e:.3f}")

    snippet = snippet_from(planks)
    root = Path(__file__).resolve().parents[1]
    out = root / "public" / "parts" / "_herringbone_snippet.txt"
    out.write_text(snippet, encoding="utf-8")

    html_path = root / "public" / "index.html"
    html = html_path.read_text(encoding="utf-8")
    updated, n = re.subn(
        r"          <pattern\s+id=\"attic-herringbone\"[\s\S]*?</pattern>",
        snippet,
        html,
        count=1,
    )
    if n != 1:
        raise SystemExit(f"failed to patch index.html (matches={n})")
    updated = updated.replace(
        "<!-- Cool-gray herringbone: true 1×3 planks, no stroke -->",
        "<!-- Cool-gray herringbone: true 1×3 planks, no stroke -->",
        1,
    )
    html_path.write_text(updated, encoding="utf-8")
    print("patched index.html")

    if Image is not None:
        scale = 2.0
        tw, th = int(px * scale), int(py * scale)
        preview = Image.new("RGB", (tw * 5, th * 3), BG)
        draw = ImageDraw.Draw(preview)
        for ix in range(5):
            for iy in range(3):
                for pts, fi in planks:
                    sp = [
                        (x * scale + ix * tw, y * scale + iy * th) for x, y in pts
                    ]
                    draw.polygon(sp, fill=FILLS[fi])
        # crop interior so edge clips aren't in the preview
        preview = preview.crop((tw, th, tw * 4, th * 2))
        prev_path = root / "public" / "parts" / "_herringbone_preview.png"
        preview.save(prev_path)
        print(f"preview {prev_path}")


if __name__ == "__main__":
    main()
