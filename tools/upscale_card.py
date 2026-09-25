#!/usr/bin/env python3
"""Upscale a card scan with the app's own Real-ESRGAN Core ML model (256px tiles, overlapped and feathered).
Usage: python3 tools/upscale_card.py <in.png> <out.png>"""
import sys
import numpy as np
import coremltools as ct
from PIL import Image

MODEL = '/Users/zhaojiapeng/App/CenterMint-1.5-authorized-upgrade/CenterMint/Resources/Models/CenterMintRealESRGAN.mlpackage'
T, O = 256, 32  # tile, overlap
m = ct.models.MLModel(MODEL)
inp = m.get_spec().description.input[0].name
src = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32) / 255.0
h, w, _ = src.shape
probe = list(m.predict({inp: np.zeros((1, 3, T, T), np.float16)}).values())[0]
S = probe.shape[-1] // T
acc = np.zeros((h * S, w * S, 3), np.float32); wsum = np.zeros((h * S, w * S, 1), np.float32)
ramp = np.minimum(np.arange(T * S) + 1, np.arange(T * S)[::-1] + 1).astype(np.float32)
win = np.minimum(np.minimum.outer(ramp, ramp), O * S)[..., None]
ys = list(range(0, max(h - T, 0) + 1, T - O)); xs = list(range(0, max(w - T, 0) + 1, T - O))
if ys[-1] != h - T: ys.append(h - T)
if xs[-1] != w - T: xs.append(w - T)
for y in ys:
    for x in xs:
        tile = src[y:y + T, x:x + T].transpose(2, 0, 1)[None].astype(np.float16)
        out = list(m.predict({inp: tile}).values())[0][0].transpose(1, 2, 0).astype(np.float32)
        acc[y * S:(y + T) * S, x * S:(x + T) * S] += out * win
        wsum[y * S:(y + T) * S, x * S:(x + T) * S] += win
res = np.clip(acc / np.maximum(wsum, 1e-6), 0, 1)
Image.fromarray((res * 255).round().astype(np.uint8)).save(sys.argv[2])
print(sys.argv[2], res.shape[1], 'x', res.shape[0], 'scale', S)
