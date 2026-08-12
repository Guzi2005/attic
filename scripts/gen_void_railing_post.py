"""Near-square railing: thick I-pillars flush under gray edge bars."""
from __future__ import annotations

import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "parts"

BODY = "#BABED6"
LITE = "#D2D6E8"
RAIL = "#9AA0B8"  # gray bars hugging hand-drawn black outline


def wobble_poly(pts, amp=1.0, seed=1, closed=True):
    rng = random.Random(seed)
    n = len(pts) - (1 if closed else 0)
    out = []
    for i, (x, y) in enumerate(pts[:n]):
        t = i / max(1, n)
        jx = math.sin(t * 17.3 + seed * 1.7) * amp + math.sin(t * 41.1 + seed * 2.9) * amp * 0.45
        jy = math.cos(t * 19.7 + seed * 2.1) * amp + math.sin(t * 37.5 + seed * 1.3) * amp * 0.4
        jx += (rng.random() - 0.5) * amp * 0.3
        jy += (rng.random() - 0.5) * amp * 0.3
        out.append((x + jx, y + jy))
    if closed:
        out.append(out[0])
    return out


def densify_rect(x0, y0, x1, y1, step=2.8):
    pts = []
    x = x0
    while x < x1:
        pts.append((x, y0))
        x += step
    pts.append((x1, y0))
    y = y0 + step
    while y < y1:
        pts.append((x1, y))
        y += step
    pts.append((x1, y1))
    x = x1 - step
    while x > x0:
        pts.append((x, y1))
        x -= step
    pts.append((x0, y1))
    y = y1 - step
    while y > y0:
        pts.append((x0, y))
        y -= step
    pts.append((x0, y0))
    return pts


def densify_trap(x_top0, x_top1, y_top, x_bot0, x_bot1, y_bot, step=2.6):
    pts = []
    x = x_top0
    while x < x_top1:
        pts.append((x, y_top))
        x += step
    pts.append((x_top1, y_top))
    steps = max(2, int(abs(y_bot - y_top) / step))
    for i in range(1, steps + 1):
        t = i / steps
        pts.append((x_top1 + (x_bot1 - x_top1) * t, y_top + (y_bot - y_top) * t))
    x = x_bot1 - step
    while x > x_bot0:
        pts.append((x, y_bot))
        x -= step
    pts.append((x_bot0, y_bot))
    for i in range(1, steps + 1):
        t = i / steps
        pts.append((x_bot0 + (x_top0 - x_bot0) * t, y_bot + (y_top - y_bot) * t))
    pts.append((x_top0, y_top))
    return pts


def path_d(pts):
    parts = [f"M{pts[0][0]:.2f} {pts[0][1]:.2f}"]
    for x, y in pts[1:]:
        parts.append(f"L{x:.2f} {y:.2f}")
    parts.append("Z")
    return " ".join(parts)


def pillar_paths(ox, seed=1):
    """I-pillar: chunky shaft, wide slot so air gap > shaft."""
    shaft_w = 72
    shaft_x0 = (SLOT - shaft_w) / 2
    shaft_x1 = shaft_x0 + shaft_w
    # Short plinth + wider splay so the base reads clearly.
    cap_pad = 16
    cap_x0, cap_x1 = shaft_x0 - cap_pad, shaft_x1 + cap_pad
    y_cap_outer_top = 0.0
    y_flare_in = RAIL_H + 5
    y_flare_out = H - RAIL_H - 5
    y_cap_outer_bot = H

    def sh(pts, amp, s):
        return wobble_poly([(x + ox, y) for x, y in pts], amp=amp, seed=s)

    paths = []
    paths.append(
        (
            BODY,
            path_d(
                sh(
                    densify_trap(
                        cap_x0, cap_x1, y_cap_outer_top, shaft_x0, shaft_x1, y_flare_in, step=2.4
                    ),
                    0.9,
                    seed + 1,
                )
            ),
        )
    )
    paths.append(
        (
            BODY,
            path_d(
                sh(
                    densify_rect(shaft_x0, y_flare_in - 1.5, shaft_x1, y_flare_out + 1.5, step=2.4),
                    0.85,
                    seed + 2,
                )
            ),
        )
    )
    paths.append(
        (
            BODY,
            path_d(
                sh(
                    densify_trap(
                        shaft_x0, shaft_x1, y_flare_out, cap_x0, cap_x1, y_cap_outer_bot, step=2.4
                    ),
                    0.9,
                    seed + 3,
                )
            ),
        )
    )
    bar_w, gap = 8.5, 5.5
    inner = shaft_x1 - shaft_x0
    total = 3 * bar_w + 2 * gap
    start = shaft_x0 + (inner - total) / 2
    sy0, sy1 = y_flare_in + 2, y_flare_out - 2
    for i in range(3):
        bx0 = start + i * (bar_w + gap)
        paths.append(
            (
                LITE,
                path_d(
                    sh(
                        densify_rect(bx0, sy0, bx0 + bar_w, sy1, step=2.0),
                        0.7,
                        seed + 10 + i * 3,
                    )
                ),
            )
        )
    return paths


def svg_doc(paths, comment):
    body = "\n".join(f'  <path fill="{c}" d="{d}"/>' for c, d in paths)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TILE_W} {H}" '
        f'preserveAspectRatio="none">\n'
        f"  <!-- {comment} -->\n"
        f"{body}\n"
        f"</svg>\n"
    )


SLOT = 140
H = 100
TILE_W = SLOT * 2
RAIL_H = 11.0


def main():
    # FRONT: pillars first, gray rails LAST so they clamp pillar ends (no 漏风)
    front = []
    front.extend(pillar_paths(0, seed=100))
    front.append(
        (
            RAIL,
            path_d(wobble_poly(densify_rect(0, 0, TILE_W, RAIL_H, step=2.8), amp=0.45, seed=40)),
        )
    )
    front.append(
        (
            RAIL,
            path_d(
                wobble_poly(
                    densify_rect(0, H - RAIL_H, TILE_W, H, step=2.8), amp=0.45, seed=41
                )
            ),
        )
    )

    # BACK: odd pillars full-height (same clamp geometry); rails only on front
    back = list(pillar_paths(SLOT, seed=200))

    (OUT / "void-railing-post-front.svg").write_text(
        svg_doc(front, "front 100%: thick pillars + rails on top"), encoding="utf-8"
    )
    (OUT / "void-railing-post-back.svg").write_text(
        svg_doc(back, "back 50%: thick odd pillars"), encoding="utf-8"
    )
    print("wrote", TILE_W, "x", H, "rail", RAIL_H, "→", OUT)


if __name__ == "__main__":
    main()
