#!/usr/bin/env python3
"""Render assets/img/og.png (1200×630) from tools/og/og.html with a throwaway headless Chrome.

Serve the repo first so the web font loads, e.g. from the parent folder of a `centermint` link to this repo:
    python3 -m http.server 8765      # then: python3 tools/render_og.py
"""
import subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
import os
URL = os.environ.get("OG_URL", "http://localhost:8765/centermint/tools/og/og.html")
out = ROOT / "assets/img/og.png"
with tempfile.TemporaryDirectory() as profile:
    subprocess.run([CHROME, "--headless=new", f"--user-data-dir={profile}", "--hide-scrollbars", "--force-device-scale-factor=1",
                    "--window-size=1200,630", "--virtual-time-budget=4000", f"--screenshot={out}", URL], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print(out, out.stat().st_size // 1024, "KB")
