"""Generate Atlas brand icons from the route/waypoint mark.

Art per brand-spec.md: three waypoints connected by a route line with a soft
gap before the destination node (uncertainty is part of the brand).

Outputs (under atlas-web/):
  public/icons/icon-192.png, icon-512.png            (graphite tile, rounded art)
  public/icons/icon-192-maskable.png, ...-512-maskable.png (full-bleed, safe zone)
  app/icon.png (256), app/apple-icon.png (180), app/favicon.ico (16/32/48)

Run: uv run --no-sync python atlas-web/scripts/generate_icons.py
No network; deterministic output.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

# Palette: chrome-dark tile works across both themes; accent is cobalt.
GRAPHITE = (20, 22, 28, 255)  # #14161C tile background
PAPER = (242, 243, 245, 255)  # #F2F3F5 route on graphite
ACCENT = (59, 130, 246, 255)  # cobalt destination

S = 512  # design canvas
SS = 4  # supersample factor

# Waypoint positions in 512-space (route up-right; W3 is "current position")
W1 = (104, 396)
W2 = (232, 284)
W3 = (312, 240)
DEST = (408, 152)


def rounded_bg(size: int, radius: int, color: tuple[int, ...]) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=color)
    return img


def draw_route(img: Image.Image, scale: float) -> None:
    """Draw the route mark onto ``img``; coordinates are 512-space * scale."""
    draw = ImageDraw.Draw(img)
    s = scale
    line_w = max(2, round(22 * s))

    solid = [(round(x * s), round(y * s)) for x, y in (W1, W2, W3)]
    draw.line(solid, fill=PAPER, width=line_w, joint="curve")
    for point in (W1, W2):
        r = 16 * s
        x, y = point[0] * s, point[1] * s
        draw.ellipse([x - r, y - r, x + r, y + r], fill=PAPER)

    r = 20 * s
    x, y = W3[0] * s, W3[1] * s
    draw.ellipse([x - r, y - r, x + r, y + r], fill=GRAPHITE, outline=PAPER, width=line_w)

    dx, dy = DEST[0] - W3[0], DEST[1] - W3[1]
    dist = math.hypot(dx, dy)
    ux, uy = dx / dist, dy / dist
    dash_len, gap_len = 26 * s, 18 * s
    travelled = 0.0
    while travelled < dist:
        end = min(travelled + dash_len, dist)
        p1 = ((W3[0] + ux * travelled) * s, (W3[1] + uy * travelled) * s)
        p2 = ((W3[0] + ux * end) * s, (W3[1] + uy * end) * s)
        draw.line([p1, p2], fill=PAPER, width=line_w)
        travelled += dash_len + gap_len

    r = 34 * s
    x, y = DEST[0] * s, DEST[1] * s
    draw.ellipse([x - r, y - r, x + r, y + r], fill=ACCENT, outline=PAPER, width=round(10 * s))


def draw_route_maskable(img: Image.Image, offset: float, art_scale: float) -> None:
    """Route mark translated into the maskable safe zone."""
    draw = ImageDraw.Draw(img)
    line_w = max(2, round(22 * art_scale))

    def pt(x: float, y: float) -> tuple[float, float]:
        return (x * art_scale + offset, y * art_scale + offset)

    solid = [pt(x, y) for x, y in (W1, W2, W3)]
    draw.line(solid, fill=PAPER, width=line_w, joint="curve")
    for point in (W1, W2):
        r = 16 * art_scale
        x, y = pt(*point)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=PAPER)

    r = 20 * art_scale
    x, y = pt(*W3)
    draw.ellipse([x - r, y - r, x + r, y + r], fill=GRAPHITE, outline=PAPER, width=line_w)

    dx, dy = DEST[0] - W3[0], DEST[1] - W3[1]
    dist = math.hypot(dx, dy)
    ux, uy = dx / dist, dy / dist
    dash_len, gap_len = 26 * art_scale, 18 * art_scale
    travelled = 0.0
    while travelled < dist:
        end = min(travelled + dash_len, dist)
        p1 = pt(W3[0] + ux * travelled, W3[1] + uy * travelled)
        p2 = pt(W3[0] + ux * end, W3[1] + uy * end)
        draw.line([p1, p2], fill=PAPER, width=line_w)
        travelled += dash_len + gap_len

    r = 34 * art_scale
    x, y = pt(*DEST)
    draw.ellipse([x - r, y - r, x + r, y + r], fill=ACCENT, outline=PAPER, width=round(10 * art_scale))


def render_tile(size: int, *, maskable: bool) -> Image.Image:
    """One icon at ``size`` px. Maskable = full-bleed with art inside safe zone."""
    big = size * SS
    if maskable:
        img = Image.new("RGBA", (big, big), GRAPHITE)
        art_scale = (big / S) * 0.66
        offset = (big - S * art_scale) / 2
        draw_route_maskable(img, offset, art_scale)
    else:
        img = rounded_bg(big, radius=112 * SS // 4, color=GRAPHITE)
        draw_route(img, big / S)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    root = Path(__file__).resolve().parents[1]  # atlas-web/
    icons = root / "public" / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    (root / "app").mkdir(parents=True, exist_ok=True)

    for size in (192, 512):
        render_tile(size, maskable=False).save(icons / f"icon-{size}.png")
        render_tile(size, maskable=True).save(icons / f"icon-{size}-maskable.png")

    render_tile(256, maskable=False).save(root / "app" / "icon.png")
    render_tile(180, maskable=True).save(root / "app" / "apple-icon.png")

    favicon = render_tile(48, maskable=False)
    favicon.save(root / "app" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    print("icons written:", sorted(p.name for p in icons.iterdir()))


if __name__ == "__main__":
    main()
