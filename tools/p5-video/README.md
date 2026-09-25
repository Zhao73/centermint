# Measure loop video (p5.js, rendered offline)

Source for `assets/video/measure-wide.{mp4,webm}` and `measure-wide-poster.webp` (the "Watch it measure" block).

A real card (1999 Pokémon Base Set Charizard, from a scan) lies on the cutting mat. A loupe travels to the
four printed borders; on each side the measuring line slides in from the artwork and settles on the inner edge
of the yellow border. Then CMY registration marks converge on the inner corners and the readout checks the
ratios against the PSA 10 front reference (55/45). No words, only numbers and drawn glyphs, so one video serves
every language.

- `sketch.js`: deterministic, each frame is a pure function of its index; 480 frames (16 s at 30 fps), frame 480
  == frame 0. Line positions from `../src/art/real/charizard-measure.json`, numbers from `charizard-app.json`
  (the same files tools/build.py uses). Video frame 0 is the finished measurement and doubles as the poster.
- `index.html`: loads p5 from `node_modules` and Archivo from `assets/fonts`.
- `render.mjs`: serves the site root on a local port, drives a throwaway headless Chrome, and pipes each PNG
  frame straight into two ffmpeg processes (H.264 CRF 26 and VP9 CRF 38, no audio). No frame files on disk.

## Re-render

```sh
cd tools/p5-video
npm install
node render.mjs                        # encode mp4 + webm + poster (needs ffmpeg and cwebp)
node render.mjs --frames 0,120,300     # preview a few PNGs in ./preview/ (gitignored), no encode
```

Uses the system Chrome at `/Applications/Google Chrome.app` by default; override with `CHROME_PATH=...`.
To watch it live, serve the site root and open `/tools/p5-video/index.html?w=1280&h=800`.
