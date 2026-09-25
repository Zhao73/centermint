# One-shape flow (live on the home page, and as a video)

`assets/js/flow.js` draws the app's path (Scan Card → analyzing → the Charizard with its four lines and ratios →
loupe check and Looks Right → Worth Grading? → corner close-ups → Submission Log row → Saved → Scan Card) as one
element that never cuts. 120 BPM, 8 bars, 16 s loop.

- Every style is computed by `seek(t)` from closed-form springs (damping 0.86, about 0.6 % overshoot). A property
  is a list of keys; each key adds a spring from the previous target, and the previous loop's springs are added
  too, so the last frame equals the first. No CSS transitions, timers or stored state.
- Labels come from `tools/content/ui.json` → `flow.app` (the app's own strings in its six languages; English
  for the other five, because the app shows English there). The shape widens to fit longer labels.
- Numbers: line positions from `tools/src/art/real/charizard-measure.json`, ratios from `charizard-app.json`.
  The Worth Grading? prices ($125.25 / $16.50) are the example from the English App screenshot.
- On the page: imported by `assets/js/home.js` when the block is 400 px away, plays with requestAnimationFrame
  only while visible, pauses in hidden tabs; with reduced motion it shows one still frame (POSTER_BEAT).
  Without JavaScript the figure shows `assets/video/flow-poster.webp`.

## Render the video

```sh
python3 tools/flow-video/render.py                    # English, 1080 x 1080, 60 fps, motion blur 4 sub-frames
python3 tools/flow-video/render.py --lang ja
python3 tools/flow-video/render.py --blur 1           # no motion blur (4x faster)
python3 tools/flow-video/render.py --poster-only      # just assets/video/flow-poster.webp
```

Needs Python Playwright (uses the system Google Chrome) and ffmpeg. Frames are piped straight into ffmpeg
(H.264, CRF 18, no audio); nothing is written to disk. `index.html` here is the render page (1080 x 1080).
