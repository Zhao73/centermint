#!/usr/bin/env python3
"""Copy App screenshots from the app repo into assets/shots/<lang>/<name>.webp (603 px wide, 2x of 300 px).

Source, first match wins:
  ../CenterMint-1.5-authorized-upgrade/tmp/raw-site/<lang>/iphone/<name>.png  (site shots with the real sample card)
  ../CenterMint-1.5-authorized-upgrade/tmp/raw-v3/<lang>/iphone/<name>.png    (App Store originals; read only, never modify)
Re-run whenever new screenshots are generated; then run tools/build.py.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
APP_TMP = ROOT.parent / "CenterMint-1.5-authorized-upgrade/tmp"
SOURCES = [APP_TMP / "raw-site", APP_TMP / "raw-v3"]
LANGS = ["en", "ja", "zh-Hans", "zh-Hant", "ko", "vi"]
NAMES = ["result", "guide", "value", "closeups", "ledger", "share"]

# assets/shots/sources.json records which source each screenshot came from. tools/build.py only shows a
# raw-v3 screenshot that has a card in it when no raw-site one exists in any language (raw-v3 used a drawn card).
MANIFEST = ROOT / "assets/shots/sources.json"
sources = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}

for lang in LANGS:
    for name in NAMES:
        src = next((d / lang / "iphone" / f"{name}.png" for d in SOURCES if (d / lang / "iphone" / f"{name}.png").exists()), None)
        if src is None:
            continue
        out = ROOT / f"assets/shots/{lang}/{name}.webp"
        key, origin = f"{lang}/{name}", src.parent.parent.parent.name
        if out.exists() and sources.get(key) == origin and out.stat().st_mtime >= src.stat().st_mtime:
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        im = Image.open(src).convert("RGB")
        im = im.resize((603, round(603 * im.height / im.width)), Image.LANCZOS)
        im.save(out, "WEBP", quality=80, method=6)
        sources[key] = origin
        print(out.relative_to(ROOT), "<-", origin, im.size, out.stat().st_size // 1024, "KB")

MANIFEST.write_text(json.dumps(dict(sorted(sources.items())), indent=1) + "\n")

# Neutral placeholder for screenshots that do not exist yet (dark screen inside the device frame).
ph = ROOT / "assets/shots/placeholder.webp"
if not ph.exists():
    Image.new("RGB", (603, 1311), (14, 15, 18)).save(ph, "WEBP", quality=60)
