#!/usr/bin/env python3
"""Build the static image assets from tools/src/art (run once after changing the art).

- assets/img/card-offcenter*.webp : texture for the 3D stage and the phone figures
- assets/img/closeup-*.webp       : real full-resolution crops of our own sample card
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


# Off-center sample card (left/right 52.9/47.1, top/bottom 50.6/49.4).
off = Image.open(ART / "card-offcenter.png").convert("RGB")
webp(off, OUT / "card-offcenter.webp", 86)
for width in (640, 360):
    webp(off.resize((width, round(width * off.height / off.width)), Image.LANCZOS), OUT / f"card-offcenter-{width}.webp", 82)

# Close-ups: the app crops the four corners and the middle of the four edges from the
# original photo at full resolution. We do the same on our own sample card photo.
card = Image.open(ART / "card.png").convert("RGB")
w, h = card.size
# The art has a white margin with rounded corners; lay it on a dark neutral background so the
# crops read like the app's close-ups (card edge against the background), not like a white glitch.
mask = Image.new("L", card.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((9, 8, 1050, 1474), radius=42, fill=255)
card = Image.composite(card, Image.new("RGB", card.size, (28, 31, 36)), mask)
s = 200  # crop size in source pixels (shown at ~110–150 CSS px)
boxes = {
    "tl": (0, 0), "t": ((w - s) // 2, 0), "tr": (w - s, 0),
    "l": (0, (h - s) // 2), "r": (w - s, (h - s) // 2),
    "bl": (0, h - s), "b": ((w - s) // 2, h - s), "br": (w - s, h - s),
}
for key, (x, y) in boxes.items():
    webp(card.crop((x, y, x + s, y + s)), OUT / f"closeup-{key}.webp", 84)

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
