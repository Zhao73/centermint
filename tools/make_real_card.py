#!/usr/bin/env python3
"""Real-card assets for the site from an upscaled scan (Base Set Charizard, base1-4):
flat card with rounded corners (3D texture + measure figure), a top-down desk photo, the 8 close-ups,
and the measured printed borders (so every number on the site matches the picture)."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'tools/src/art/real'
card = Image.open(ART / 'charizard-up.png').convert('RGB')
W, H = card.size

# Rounded corners like a real card (3.18 mm radius on a 63 mm card).
radius = round(W * 3.18 / 63)
mask = Image.new('L', (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), radius=radius, fill=255)
flat = card.convert('RGBA'); flat.putalpha(mask)

# Printed borders: the yellow frame's inner edge, measured along the middle of each side.
a = np.asarray(card).astype(int)
yellow = (a[..., 0] > 170) & (a[..., 1] > 140) & (a[..., 2] < 120)
def run(line):
    n = 0
    while n < len(line) and line[n]: n += 1
    return n
mid_rows = range(int(H * 0.42), int(H * 0.58), 4); mid_cols = range(int(W * 0.40), int(W * 0.60), 4)
L = np.median([run(yellow[y, :]) for y in mid_rows]); R = np.median([run(yellow[y, ::-1]) for y in mid_rows])
T = np.median([run(yellow[:, x]) for x in mid_cols]); B = np.median([run(yellow[::-1, x]) for x in mid_cols])
lr = (100 * L / (L + R), 100 * R / (L + R)); tb = (100 * T / (T + B), 100 * B / (T + B))
info = {'size': [W, H], 'border_px': {'l': L, 'r': R, 't': T, 'b': B},
        'lr': [round(lr[0], 1), round(lr[1], 1)], 'tb': [round(tb[0], 1), round(tb[1], 1)]}
print(json.dumps(info))
(ART / 'charizard-measure.json').write_text(json.dumps(info, indent=2))
flat.save(ART / 'charizard-flat.png')

# Top-down desk photo: dark woven mat, soft shadow, gentle light falloff, sensor noise.
m = round(0.16 * W)
rng = np.random.default_rng(7)
base = np.full((H + 2 * m, W + 2 * m, 3), (34, 36, 40), np.float32)
weave = rng.normal(0, 7, base.shape[:2])[..., None]
base += np.asarray(Image.fromarray(np.uint8(np.clip(weave + 128, 0, 255)[..., 0])).filter(ImageFilter.GaussianBlur(1.2)), np.float32)[..., None] - 128
yy, xx = np.mgrid[0:base.shape[0], 0:base.shape[1]]
fall = 1.08 - 0.22 * (((xx - base.shape[1] * 0.35) / base.shape[1]) ** 2 + ((yy - base.shape[0] * 0.3) / base.shape[0]) ** 2)
desk = Image.fromarray(np.uint8(np.clip(base * fall[..., None], 0, 255))).convert('RGBA')
shadow = Image.new('RGBA', desk.size, (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((m + 10, m + 22, m + W + 10, m + H + 22), radius=radius, fill=(0, 0, 0, 150))
desk.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(28)))
lit = np.asarray(flat, np.float32)
lit[..., :3] *= (0.97 + 0.06 * (1 - yy[m:m + H, m:m + W] / base.shape[0]))[..., None]
lit[..., :3] += rng.normal(0, 2.2, (H, W, 1))
desk.alpha_composite(Image.fromarray(np.uint8(np.clip(lit, 0, 255))), (m, m))
photo = desk.convert('RGB')
photo.save(ART / 'charizard-desk.jpg', quality=93)

# Close-ups: same square around each corner and each edge midpoint.
fw, fh = photo.size
# Mostly card, with a thin strip of mat so the cut edge and corner rounding stay readable.
s = round(0.24 * W); pad = round(0.05 * W)
x0, y0, x1, y1 = m - pad, m - pad, m + W + pad - s, m + H + pad - s
spots = {'tl': (x0, y0), 'tr': (x1, y0), 'bl': (x0, y1), 'br': (x1, y1),
         't': ((fw - s) // 2, y0), 'b': ((fw - s) // 2, y1), 'l': (x0, (fh - s) // 2), 'r': (x1, (fh - s) // 2)}
for k, (x, y) in spots.items():
    photo.crop((x, y, x + s, y + s)).resize((400, 400), Image.LANCZOS).save(ROOT / f'assets/img/closeup-{k}.webp', quality=86)
print('desk', photo.size)
