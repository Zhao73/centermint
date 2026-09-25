#!/usr/bin/env python3
"""Build the static image assets from tools/src/art (run once after changing the art).

- assets/img/sample-card*.webp    : the real sample card (texture for the 3D stage, hero/step figures, OG)
- assets/img/apple-touch-icon.png, favicon.svg
Screenshots are imported separately by tools/import_shots.py; the OG image by tools/render_og.py.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "tools/src/art"
OUT = ROOT / "assets/img"
OUT.mkdir(parents=True, exist_ok=True)


def webp(im, path, q=84):
    im.save(path, "WEBP", quality=q, method=6)
    print(path.relative_to(ROOT), im.size, path.stat().st_size // 1024, "KB")


# The sample card is a real one: a 1999 Base Set Charizard scan, upscaled by tools/make_real_card.py,
# which also measures its printed borders (tools/src/art/real/charizard-measure.json).
flat = Image.open(ART / "real/charizard-flat.png").convert("RGBA")
# 3D texture: opaque, corners filled with the border colour so the shader's rounded mask never shows a dark fringe.
opaque = Image.new("RGBA", flat.size, flat.getpixel((flat.width // 2, 12)))
opaque.alpha_composite(flat)
opaque = opaque.convert("RGB")
webp(opaque.resize((1600, round(1600 * flat.height / flat.width)), Image.LANCZOS), OUT / "sample-card.webp", 86)
# Figures (hero, steps, OG): keep the transparent rounded corners.
for width in (960, 640, 480, 360):
    webp(flat.resize((width, round(width * flat.height / flat.width)), Image.LANCZOS), OUT / f"sample-card-{width}.webp", 74)
# The eight close-ups (assets/img/closeup-*.webp) come from tools/make_real_card.py.

# Guide figure: the top printed border of the real card under a loupe, with the measuring line on its inner edge.
import json
from PIL import ImageFilter
m = json.loads((ART / "real/charizard-measure.json").read_text())
top = m["border_px"]["t"]
S, Z = 900, 4                                   # output size, magnification (card px -> figure px)
half = S / Z / 2
cx, cy = m["size"][0] * 0.5, top * 0.55         # lens centre: middle of the top border, a little above its inner edge
fig = Image.new("RGBA", (S, S), (46, 91, 79, 255))
d = ImageDraw.Draw(fig)
for step, a in ((20 * Z / 4, 18), (100 * Z / 4, 40)):   # cutting-mat grid, magnified with the card
    x = 0.0
    while x < S:
        d.line([(x, 0), (x, S)], fill=(232, 240, 236, a)); d.line([(0, x), (S, x)], fill=(232, 240, 236, a)); x += step
box = (int(cx - half), 0, int(cx + half), int(cy + half))
crop = flat.crop(box).resize(((box[2] - box[0]) * Z, (box[3] - box[1]) * Z), Image.LANCZOS)
fig.alpha_composite(crop, (0, int(S / 2 - cy * Z)))
d = ImageDraw.Draw(fig)
y_edge, y_inner = S / 2 - cy * Z, S / 2 + (top - cy) * Z
d.line([(0, y_inner), (S, y_inner)], fill=(0, 160, 220, 255), width=5)
bx = S * 0.72
d.line([(bx, y_edge), (bx, y_inner)], fill=(214, 36, 123, 255), width=4)
for y in (y_edge, y_inner):
    d.line([(bx - 16, y), (bx + 16, y)], fill=(214, 36, 123, 255), width=4)
lens = Image.new("L", (S, S), 0)
ImageDraw.Draw(lens).ellipse((6, 6, S - 7, S - 7), fill=255)
out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
out.paste(fig, (0, 0), lens.filter(ImageFilter.GaussianBlur(1)))
ImageDraw.Draw(out).ellipse((6, 6, S - 7, S - 7), outline=(20, 22, 26, 255), width=10)
webp(out.resize((600, 600), Image.LANCZOS), OUT / "loupe-top-border.webp", 82)

# Icons: a registration mark (circle + cross) in ink on proof white.
def reg_mark(size):
    im = Image.new("RGB", (size, size), (243, 245, 247))
    d = ImageDraw.Draw(im)
    c, r, lw = size / 2, size * 0.26, max(2, round(size * 0.055))
    d.ellipse((c - r, c - r, c + r, c + r), outline=(20, 22, 26), width=lw)
    arm = size * 0.40
    d.rectangle((c - lw / 2, c - arm, c + lw / 2, c + arm), fill=(20, 22, 26))
    d.rectangle((c - arm, c - lw / 2, c + arm, c + lw / 2), fill=(20, 22, 26))
    return im

reg_mark(180).save(OUT / "apple-touch-icon.png")
(OUT / "favicon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    '<rect width="32" height="32" rx="7" fill="#F3F5F7"/>'
    '<g fill="none" stroke="#14161A" stroke-width="2.2"><circle cx="16" cy="16" r="8"/>'
    '<path d="M16 3v26M3 16h26"/></g></svg>\n'
)
print("icons ok")
