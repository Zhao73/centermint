# One-shape loops (live on the home page, and as videos)

`assets/js/flow.js` has six short loops, one per app task, shown in the "See it in the app" block right after
the hero: measure (Scan Card -> analyzing -> the Charizard with four lines and both ratios), check (loupe,
drag the line onto the edge, Looks Right, next line), worth (type the PSA 10 price, profit bars, verdict),
closeups (corners and edges, tap to look closer), ledger (new submission: Preparing -> Sent -> Returned 4/4)
and share (Share Studio layouts, measuring lines off and on). 120 BPM; 6 to 8 s each.

- Each loop is one element that never cuts. Every style is computed by `seek(t)` from closed-form springs
  (damping 0.86, about 0.6 % overshoot). A property is a list of keys; each key adds a spring from the previous
  target, and the previous loop's springs are added too, so the last frame equals the first. `tracks()` throws
  if a track does not end on its first value. No CSS transitions, timers or stored state.
- Black, white and greys only; the card scan keeps its colours.
- Labels: `tools/content/ui.json` -> `flows.app`, the app's own strings (from the app's Localizable.strings) in
  its six languages; English on the other five pages, because the app shows English there. Shapes widen to
  fit longer labels; long titles shrink.
- Numbers: line positions from `tools/src/art/real/charizard-measure.json`, ratios from `charizard-app.json`.
  Worth Grading? prices ($35 / $85 / $210, fee $27, 13 %) give the app's +$125.25 / +$16.50.
- On the page: `assets/js/home.js` imports the module when the block is 400 px away and mounts all six; each
  plays with requestAnimationFrame only while on screen and pauses in hidden tabs. Reduced motion: one still
  frame per loop. Phones: a horizontal row with scroll snap; tablets two columns; desktop three.

## Render the videos

```sh
python3 tools/flow-video/render.py                          # all six, English, 1080 x 1080, 60 fps, 4 sub-frames
python3 tools/flow-video/render.py --lang ja --blur 3
python3 tools/flow-video/render.py --seg check --blur 1     # one loop, no motion blur
```

Output: `assets/video/flow-<segment>-<lang>.mp4` (H.264, CRF 18, no audio). Needs Python Playwright (it uses
the system Google Chrome) and ffmpeg. Frames are piped straight into ffmpeg; nothing is written to disk.
