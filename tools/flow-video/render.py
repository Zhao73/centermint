#!/usr/bin/env python3
"""Render the one-shape flow (assets/js/flow.js) to assets/video/flow-<lang>.mp4 (1080 x 1080, 60 fps, no audio)
and the still frame assets/video/flow-poster.webp.

Frames are screenshotted by Playwright's Chromium and piped straight into ffmpeg: no frame files on disk.
With --blur N each output frame is the average of N sub-frames (motion blur; N=1 turns it off).

    python3 tools/flow-video/render.py                    # English, 60 fps, 4 sub-frames
    python3 tools/flow-video/render.py --lang ja --blur 1
    python3 tools/flow-video/render.py --poster-only
"""
import argparse, http.server, socketserver, subprocess, threading, io
from functools import partial
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--lang", default="en")
ap.add_argument("--fps", type=int, default=60)
ap.add_argument("--blur", type=int, default=4)
ap.add_argument("--poster-only", action="store_true")
args = ap.parse_args()

handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
handler.log_message = lambda *a, **k: None
srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{srv.server_address[1]}/tools/flow-video/index.html?lang={args.lang}"

with sync_playwright() as p:
    # System Chrome by default (no browser download); falls back to Playwright's own Chromium.
    try:
        browser = p.chromium.launch(channel="chrome")
    except Exception:
        browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1080, "height": 1080}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(url)
    page.wait_for_function("window.__ready === true", timeout=60000)
    info = page.evaluate("window.FLOW")

    def shot(t):
        page.evaluate(f"window.flowSeek({t})")
        return page.screenshot(type="png")

    out = ROOT / "assets/video"
    poster = Image.open(io.BytesIO(shot(info["poster"]))).convert("RGB")
    poster.save(out / "flow-poster.webp", "WEBP", quality=82, method=6)
    print("flow-poster.webp", (out / "flow-poster.webp").stat().st_size // 1024, "KB")

    if not args.poster_only:
        frames = round(info["duration"] * args.fps)
        dst = out / f"flow-{args.lang}.mp4"
        ff = subprocess.Popen(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                               "-s", "1080x1080", "-r", str(args.fps), "-i", "-", "-an", "-c:v", "libx264", "-preset", "slow",
                               "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", str(dst)],
                              stdin=subprocess.PIPE)
        n = max(1, args.blur)
        shutter = 0.5  # sub-frames spread over half a frame (180-degree shutter)
        for i in range(frames):
            acc = None
            for k in range(n):
                t = (i + shutter * (k / n - 0.5)) / args.fps
                im = Image.open(io.BytesIO(shot(t % info["duration"]))).convert("RGB")
                acc = im if acc is None else Image.blend(acc, im, 1 / (k + 1))
            ff.stdin.write(acc.tobytes())
            if i % 120 == 0:
                print(f"frame {i}/{frames}", flush=True)
        ff.stdin.close()
        ff.wait()
        print(dst.name, dst.stat().st_size // 1024, "KB")
    browser.close()
    srv.shutdown()
    if errors:
        raise SystemExit("page errors: " + "; ".join(errors))
