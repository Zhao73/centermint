#!/usr/bin/env python3
"""Copy App screenshots from the app repo into assets/shots/<lang>/<name>.webp (603 px wide, 2x of 300 px).

Source: ../CenterMint-1.5-authorized-upgrade/tmp/raw-v3/<lang>/iphone/<name>.png (1206×2622).
Re-run whenever new screenshots are generated; then run tools/build.py.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT.parent / "CenterMint-1.5-authorized-upgrade/tmp/raw-v3"
LANGS = ["en", "ja", "zh-Hans", "zh-Hant", "ko", "vi"]
NAMES = ["result", "guide", "value", "closeups", "ledger", "share"]

for lang in LANGS:
    for name in NAMES:
        src = SRC / lang / "iphone" / f"{name}.png"
        if not src.exists():
            continue
        out = ROOT / f"assets/shots/{lang}/{name}.webp"
        if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        im = Image.open(src).convert("RGB")
        im = im.resize((603, round(603 * im.height / im.width)), Image.LANCZOS)
        im.save(out, "WEBP", quality=80, method=6)
        print(out.relative_to(ROOT), im.size, out.stat().st_size // 1024, "KB")

# Neutral placeholder for screenshots that do not exist yet (dark screen inside the device frame).
ph = ROOT / "assets/shots/placeholder.webp"
if not ph.exists():
    Image.new("RGB", (603, 1311), (14, 15, 18)).save(ph, "WEBP", quality=60)
