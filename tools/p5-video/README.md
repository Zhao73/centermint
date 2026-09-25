# Measure loop video (p5.js, rendered offline)

Source for `assets/video/measure-{wide,tall}.{mp4,webm}` and their `-poster.webp`.
A cutting mat, abstract cards dropping in, measurement lines / crop marks / CMY
registration marks locking on, centering ratios rolling in. One card per loop is
off-center and flagged in magenta. No words anywhere (the video is shared by all
language pages).

- `sketch.js` — the p5 sketch. Deterministic: each frame is a pure function of the
  frame index (no clock, no `Math.random`). 4 cards x 110 frames = 440 frames
  (14.67 s at 30 fps); frame 440 == frame 0, so the video loops seamlessly.
  Size comes from the query string: `index.html?w=1280&h=800`.
- `index.html` — loads p5 from `node_modules` and Archivo from `assets/fonts`.
- `render.mjs` — serves the site root on a local port, opens the page in a
  throwaway headless Chrome profile, calls `window.renderFrame(i)` for every frame,
  saves PNGs to `frames/<name>/`, then encodes.

## Re-render

```sh
cd tools/p5-video
npm install
node render.mjs                        # both renditions + encode (needs ffmpeg, cwebp)
node render.mjs --only tall            # one rendition
node render.mjs --frames 0,120,300     # preview a few PNGs only (no encode)
```

Uses the system Chrome at `/Applications/Google Chrome.app` by default; override
with `CHROME_PATH=...`. To watch it animate live, serve the site root
(`npx serve ../..`) and open `/tools/p5-video/index.html?w=1280&h=800`.

## Encode commands (what render.mjs runs)

```sh
# H.264
ffmpeg -framerate 30 -i frames/wide/%04d.png -c:v libx264 -preset slow -crf 26 \
  -pix_fmt yuv420p -profile:v high -movflags +faststart -an ../../assets/video/measure-wide.mp4
# VP9, two-pass constant quality
ffmpeg -framerate 30 -i frames/wide/%04d.png -c:v libvpx-vp9 -b:v 0 -crf 38 -deadline good \
  -cpu-used 2 -row-mt 1 -pix_fmt yuv420p -an -pass 1 -f null /dev/null
ffmpeg -framerate 30 -i frames/wide/%04d.png -c:v libvpx-vp9 -b:v 0 -crf 38 -deadline good \
  -cpu-used 2 -row-mt 1 -pix_fmt yuv420p -an -pass 2 ../../assets/video/measure-wide.webm
# poster = frame 0 (a fully measured card; also the video's first frame)
cwebp -q 80 frames/wide/0000.png -o ../../assets/video/measure-wide-poster.webp
```

Same for `tall` (720x900). Sizes: wide 1280x800, tall 720x900, rendered natively.
