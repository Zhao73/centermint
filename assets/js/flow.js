// "One shape" flow: the app's path from Scan Card to the Submission Log, as one continuously morphing element.
//
// Everything on screen is a pure function of time: seek(t) computes every style from closed-form springs.
// A property is a list of keys [beat, value, response]; each key starts a spring from the previous target to
// the new one and the springs add up, so retargeting mid-flight stays continuous. No CSS transitions, no
// timers, no stored animation state. 120 BPM, 8 bars (32 beats = 16 s). Every track ends on its first value
// and the previous loop's springs are added in, so the last frame flows into the first without a seam.
//
// Mounted by assets/js/home.js when the block nears the viewport; tools/flow-video/render.py seeks it frame
// by frame to encode assets/video/flow-*.mp4.

const BEAT = 0.5;                  // seconds per beat (120 BPM)
const BEATS = 32;                  // 8 bars
export const DURATION = BEATS * BEAT;
export const POSTER_BEAT = 7.4;    // the card measured, readout shown: the static frame for reduced motion / the poster

const W = 1080;                    // design units: the stage is W x W, centre 540, 540
const INK = [20, 22, 26], WHITE = [255, 255, 255], ACCENT = [0, 160, 220];

// ---------- closed-form spring (step response 0 -> 1); damping 0.86 gives about 0.6 % overshoot ----------
const ZETA = 0.86;
function spring(dt, resp) {
  if (dt <= 0) return 0;
  const w = (2 * Math.PI) / resp, wd = w * Math.sqrt(1 - ZETA * ZETA), a = ZETA * w;
  if (a * dt > 14) return 1;
  return 1 - Math.exp(-a * dt) * (Math.cos(wd * dt) + (a / wd) * Math.sin(wd * dt));
}

// keys: [[beat, value, resp?], ...]. Values are numbers or arrays (colours, points). The last key must equal
// the first; then value(t) = v0 + sum(delta_k * (S(t - t_k) + S(t + DURATION - t_k))) is exactly periodic.
function track(keys, resp = 0.42) {
  const v0 = keys[0][1];
  const arr = Array.isArray(v0);
  const ks = [];
  for (let i = 1; i < keys.length; i++) {
    const prev = keys[i - 1][1], cur = keys[i][1];
    ks.push({ t: keys[i][0] * BEAT, r: keys[i][2] || resp, d: arr ? cur.map((c, j) => c - prev[j]) : cur - prev });
  }
  if (arr) {
    return (t) => {
      const out = v0.slice();
      for (const k of ks) { const s = spring(t - k.t, k.r) + spring(t + DURATION - k.t, k.r); for (let j = 0; j < out.length; j++) out[j] += k.d[j] * s; }
      return out;
    };
  }
  return (t) => {
    let v = v0;
    for (const k of ks) v += k.d * (spring(t - k.t, k.r) + spring(t + DURATION - k.t, k.r));
    return v;
  };
}

const rgb = (c) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",")})`;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---------- geometry (design units) ----------
const PANEL = { w: 560, h: 800 };                      // measuring panel; the card image sits inside it
const PANEL_X = 540 - PANEL.w / 2, PANEL_Y = 540 - PANEL.h / 2;
const CARD = { x: 80, y: 40, w: 400, h: 550 };         // card image, panel-local
const LOUPE_R = 90, LOUPE_MAG = 4;                     // loupe radius (design units), card-image units -> loupe units
const LINE_OFF = 2.6;                                  // the suggested right line starts this far off (card-image units)
const GRID = { w: 600, pad: 24, gap: 12 };
const TILE = (GRID.w - 2 * GRID.pad - GRID.gap) / 2;

export async function mount(root, { labels, card, images, still = false }) {
  const L = { l: (card.l / card.w) * CARD.w, r: (card.r / card.w) * CARD.w, t: (card.t / card.h) * CARD.h, b: (card.b / card.h) * CARD.h };
  const loupeLocal = [CARD.x + L.r, CARD.y + CARD.h * 0.42];            // panel-local
  const loupeWorld = [PANEL_X + loupeLocal[0], PANEL_Y + loupeLocal[1]];
  const tileWorld = [540 - GRID.w / 2 + GRID.pad + TILE / 2, 540 - GRID.w / 2 + GRID.pad + TILE / 2];

  // ---------- DOM, built once ----------
  root.textContent = "";
  const stage = el("div", "fl-stage", root);
  const world = el("div", "fl-world", stage);
  const shape = el("div", "fl-shape", world);

  const btn = el("div", "fl-layer fl-btn", shape);
  btn.textContent = labels.scan;

  const loader = el("div", "fl-layer fl-loader", shape);
  loader.innerHTML = '<svg viewBox="0 0 60 60"><circle class="fl-ring-bg" cx="30" cy="30" r="22"/><circle class="fl-ring" cx="30" cy="30" r="22" pathLength="100"/></svg>';
  const ring = loader.querySelector(".fl-ring");

  const panel = el("div", "fl-layer fl-panel", shape);
  const img = el("img", "fl-card-img", panel);
  Object.assign(img, { src: images.card, alt: "", decoding: "async" });
  const lineBox = el("div", "fl-lines", panel);
  const lines = Object.fromEntries(["l", "r", "t", "b"].map((k) => [k, el("i", `fl-line fl-line-${k}`, lineBox)]));
  const rows = [0, 1].map((i) => {
    const r = el("div", "fl-ro-row", panel);
    r.style.top = `${CARD.y + CARD.h + 26 + i * 64}px`;
    el("span", "fl-ro-k", r).textContent = i ? "↕" : "↔";
    return { r, v: el("span", "fl-ro-v", r) };
  });
  const loupe = el("div", "fl-loupe", panel);
  const loupeImg = el("img", "fl-loupe-img", loupe);
  Object.assign(loupeImg, { src: images.loupe, alt: "", decoding: "async" });
  const loupeLine = el("i", "fl-loupe-line", loupe);
  const looks = el("div", "fl-looks", panel);
  const looksLabel = el("span", "fl-looks-label", looks);
  looksLabel.textContent = labels.looks;
  looks.insertAdjacentHTML("beforeend", '<svg class="fl-check" viewBox="0 0 40 40"><path d="M11 21l6 6 12-14" pathLength="100"/></svg>');
  const looksCheck = looks.querySelector("path");

  const worth = el("div", "fl-layer fl-worth", shape);
  el("p", "fl-worth-t", worth).textContent = labels.worth;
  const bars = [["PSA 10", 125.25], ["PSA 9", 16.5]].map(([k, v]) => {
    const r = el("div", "fl-bar-row", worth);
    el("span", "fl-bar-k", r).textContent = k;
    const track_ = el("span", "fl-bar", r);
    return { r, fill: el("i", "", track_), val: el("span", "fl-bar-v", r), v };
  });

  const grid = el("div", "fl-layer fl-grid", shape);
  const tiles = images.tiles.map((src) => {
    const t = el("div", "fl-tile", grid);
    Object.assign(el("img", "", t), { src, alt: "", decoding: "async" });
    return t;
  });

  const row = el("div", "fl-layer fl-row", shape);
  row.innerHTML = '<span class="fl-row-k">PSA · Value</span><span class="fl-row-v">4/4</span><svg class="fl-chev" viewBox="0 0 12 20"><path d="M2 2l8 8-8 8"/></svg>';

  const toast = el("div", "fl-layer fl-toast", shape);
  toast.innerHTML = '<svg class="fl-check" viewBox="0 0 40 40"><path d="M11 21l6 6 12-14" pathLength="100"/></svg>';
  el("span", "", toast).textContent = labels.saved;
  const toastCheck = toast.querySelector("path");

  const cursor = el("div", "fl-cursor", stage);
  cursor.innerHTML = '<svg viewBox="0 0 28 34"><path d="M3 2.5v24.2l6.1-5.6 3.9 9.3 4.6-2-3.9-9.1 8.5-.5z"/></svg>';

  // ---------- fit the shape to the labels (they differ by language) ----------
  // Load the web font for these exact strings first (fonts.ready alone can resolve before a load has started).
  const text = Object.values(labels).join("");
  await Promise.all(["640 40px Archivo", "760 46px Archivo", "720 42px Archivo"].map((f) => document.fonts.load(f, text).catch(() => {})));
  const BTN_W = Math.max(400, Math.ceil(btn.offsetWidth + 128));
  const TOAST_W = Math.max(360, Math.ceil(toast.offsetWidth + 112));
  const LOOKS_W = Math.max(330, Math.ceil(looksLabel.offsetWidth + 96));
  const title = worth.firstChild;
  if (title.scrollWidth > 680 - 96) title.style.fontSize = `${Math.floor((46 * (680 - 96)) / title.scrollWidth)}px`;

  // ---------- timeline (beats) ----------
  // bar 1: Scan Card, press, analyzing | bar 2: card, lines, ratios | bar 3: loupe, drag, Looks Right |
  // bar 4: Worth Grading? | bar 5: close-ups | bar 6: Submission Log row | bar 7: Saved | bar 8: back to Scan Card
  // bar 1: Scan Card, press, analyzing | bar 2: card, lines, ratios | bar 3: loupe, drag the line |
  // bar 4: Looks Right, Worth Grading? | bar 5: bars and profit | bar 6: close-ups | bar 7: Submission Log, Saved |
  // bar 8: back to Scan Card; the cursor leaves and comes back to hover it.
  const HOVER = [44, 47, 54];
  const sW = track([[0, BTN_W], [1.35, 120, 0.36], [4, PANEL.w, 0.5], [14, 680, 0.5], [18.6, GRID.w, 0.5], [24, 680, 0.46], [27, TOAST_W, 0.42], [29, BTN_W, 0.42]]);
  const sH = track([[0, 112], [1.35, 120, 0.36], [4, PANEL.h, 0.5], [14, 430, 0.5], [18.6, GRID.w, 0.5], [24, 128, 0.46], [27, 104, 0.42], [29, 112, 0.42]]);
  const sR = track([[0, 56], [1.35, 60, 0.36], [4, 40, 0.5], [24, 32, 0.46], [27, 52, 0.42], [29, 56, 0.42]]);
  const sBg = track([[0, HOVER], [1.3, INK, 0.3], [4, WHITE, 0.3], [27, INK, 0.3], [31.2, HOVER, 0.3]]);
  const sPress = track([[0, 1], [1, 0.95, 0.16], [1.25, 1, 0.3], [26, 0.97, 0.16], [26.25, 1, 0.3]]);

  const camZ = track([[0, 1.75], [1.35, 2.5, 0.5], [4, 1.12, 0.62], [8, 2.3, 0.62], [10, 1.12, 0.6], [14, 1.36, 0.55],
    [18.6, 1.5, 0.55], [20.6, 2.9, 0.6], [22.6, 1.5, 0.6], [24, 1.4, 0.5], [27, 2.1, 0.5], [29, 1.75, 0.5]]);
  const camC = track([[0, [540, 540]], [8, loupeWorld, 0.62], [10, [540, 552], 0.6], [14, [540, 540], 0.55],
    [20.6, tileWorld, 0.6], [22.6, [540, 540], 0.6]]);

  const oBtn = track([[0, 1], [1.35, 0, 0.16], [29.2, 1, 0.22]]);
  const oLoader = track([[0, 0], [1.45, 1, 0.2], [4, 0, 0.16]]);
  const oPanel = track([[0, 0], [4.1, 1, 0.26], [14, 0, 0.18]]);
  const oLines = ["l", "r", "t", "b"].map((k, i) => track([[0, 0], [5 + i * 0.125, 1, 0.3], [14, 0, 0.2]]));
  const oRows = [0, 1].map((i) => track([[0, 0], [6 + i * 0.15, 1, 0.24], [10.2, 0, 0.2]]));
  const rollLR = track([[0, 50], [6, card.lr[0], 0.55], [14.2, 50, 0.2]]);
  const rollTB = track([[0, 50], [6.15, card.tb[0], 0.55], [14.2, 50, 0.2]]);
  const oLoupe = track([[0, 0], [7.6, 1, 0.34], [10.1, 0, 0.26]]);
  // The suggested right line is a hair off; only the loupe (4x) shows it. Dragged onto the edge, then reset while hidden.
  const lineOff = track([[0, LINE_OFF], [9.05, 0, 0.62], [14.5, LINE_OFF, 0.1]]);
  const oLooks = track([[0, 0], [10.4, 1, 0.3], [14, 0, 0.18]]);
  const looksW = track([[0, LOOKS_W], [12.25, 96, 0.42], [14.5, LOOKS_W, 0.1]]);
  const looksBg = track([[0, INK], [12.25, ACCENT, 0.3], [14.5, INK, 0.1]]);
  const looksPress = track([[0, 1], [12, 0.94, 0.16], [12.2, 1, 0.3]]);
  const oLooksLabel = track([[0, 1], [12.2, 0, 0.14], [14.6, 1, 0.1]]);
  const looksDraw = track([[0, 100], [12.4, 0, 0.4], [14.6, 100, 0.1]]);

  const oWorth = track([[0, 0], [14.1, 1, 0.26], [18.6, 0, 0.18]]);
  const barW = [track([[0, 0], [15, 1, 0.55], [18.9, 0, 0.1]]), track([[0, 0], [15.5, 16.5 / 125.25, 0.55], [18.9, 0, 0.1]])];
  const count = [track([[0, 0], [15.6, 125.25, 0.6], [18.9, 0, 0.1]]), track([[0, 0], [16, 16.5, 0.6], [18.9, 0, 0.1]])];
  const oCount = [track([[0, 0], [15.6, 1, 0.2], [18.6, 0, 0.18]]), track([[0, 0], [16, 1, 0.2], [18.6, 0, 0.18]])];
  const hi = track([[0, 0], [17, 1, 0.22], [18, 0, 0.4]]);

  const oGrid = track([[0, 0], [18.7, 1, 0.26], [24, 0, 0.18]]);
  const oTiles = [0, 1, 2, 3].map((i) => track([[0, 0], [18.7 + i * 0.1, 1, 0.3], [24, 0, 0.18]]));
  const sel = track([[0, 0], [20.6, 1, 0.25], [22.6, 0, 0.3]]);

  const oRow = track([[0, 0], [24.15, 1, 0.26], [27, 0, 0.16]]);
  const oToast = track([[0, 0], [27.15, 1, 0.24], [29, 0, 0.16]]);
  const toastDraw = track([[0, 100], [27.5, 0, 0.4], [29.3, 100, 0.1]]);

  // cursor, in world coordinates (drawn at a constant screen size)
  const grab = [loupeWorld[0] + LINE_OFF * LOUPE_MAG, loupeWorld[1] + 56];
  const looksAt = [590, PANEL_Y + 690 + 42];
  const cur = track([
    [0, [600, 562]],                                                // hovering Scan Card
    [2.2, [690, 640], 0.7], [4.4, [880, 720], 0.7],                 // out of the way while it analyses
    [7.3, grab, 0.7], [9.05, [loupeWorld[0], grab[1]], 0.62],       // grab the right line in the loupe, drag it onto the edge
    [10.6, looksAt, 0.6], [13, [860, 760], 0.7],                    // Looks Right
    [16.4, [650, 548], 0.6], [17.8, [880, 700], 0.7],               // PSA 10 row
    [19.7, [tileWorld[0] + 40, tileWorld[1] + 50], 0.6], [22.1, [tileWorld[0] + 60, tileWorld[1] + 70], 0.7], // top-left close-up
    [24.8, [760, 548], 0.6], [27.3, [820, 700], 0.7],               // Submission Log row
    [29.6, [900, 900], 0.8], [30.8, [600, 562], 0.8],               // away, then back to hover Scan Card
  ]);
  const curPress = track([[0, 1], [1, 0.84, 0.14], [1.25, 1, 0.24], [9, 0.84, 0.14], [10, 1, 0.24], [12, 0.84, 0.14], [12.2, 1, 0.24],
    [17, 0.84, 0.14], [17.2, 1, 0.24], [20.5, 0.84, 0.14], [20.7, 1, 0.24], [22.4, 0.84, 0.14], [22.6, 1, 0.24], [26, 0.84, 0.14], [26.2, 1, 0.24]]);

  // ---------- seek ----------
  let scale = 1;
  const show = (node, o, base = "translate(-50%,-50%)") => {
    const a = clamp01(o);
    const s = node.style;
    s.opacity = a.toFixed(3);
    s.visibility = a < 0.004 ? "hidden" : "visible";
    const blur = (1 - a) * 9;
    s.filter = blur > 0.2 && a > 0.004 ? `blur(${blur.toFixed(2)}px)` : "none";
    s.transform = `${base} scale(${(0.97 + 0.03 * a).toFixed(4)})`;
  };

  function seek(tSec) {
    const t = ((tSec % DURATION) + DURATION) % DURATION;
    const b = t / BEAT;
    const z = camZ(t), [cx, cy] = camC(t);
    world.style.transform = `translate(${(W / 2) * scale}px,${(W / 2) * scale}px) scale(${(z * scale).toFixed(5)}) translate(${(-cx).toFixed(2)}px,${(-cy).toFixed(2)}px)`;

    const sw = sW(t), sh = sH(t);
    const ss = shape.style;
    ss.width = `${sw.toFixed(2)}px`;
    ss.height = `${sh.toFixed(2)}px`;
    ss.borderRadius = `${Math.max(0, sR(t)).toFixed(2)}px`;
    ss.background = rgb(sBg(t));
    ss.transform = `translate(${(540 - sw / 2).toFixed(2)}px,${(540 - sh / 2).toFixed(2)}px) scale(${sPress(t).toFixed(4)})`;

    show(btn, oBtn(t));
    show(loader, oLoader(t));
    ring.style.transform = `rotate(${((b * 180) % 360).toFixed(1)}deg)`;
    ring.style.strokeDashoffset = (62 - 30 * Math.sin(b * Math.PI)).toFixed(2);

    show(panel, oPanel(t));
    ["l", "r", "t", "b"].forEach((k, i) => {
      const o = clamp01(oLines[i](t)), s = lines[k].style;
      s.opacity = o.toFixed(3);
      const slide = (1 - o) * 26 * (k === "l" || k === "t" ? 1 : -1);
      s.transform = k === "l" || k === "r" ? `translateX(${(L[k] + slide).toFixed(2)}px)` : `translateY(${(L[k] + slide).toFixed(2)}px)`;
    });
    rows.forEach(({ r, v }, i) => {
      const o = clamp01(oRows[i](t));
      r.style.opacity = o.toFixed(3);
      r.style.transform = `translate(-50%,${((1 - o) * 10).toFixed(2)}px)`;
      const target = i ? card.tb[0] : card.lr[0];
      const val = Math.max(50, Math.min(target, i ? rollTB(t) : rollLR(t)));   // counters never overshoot their reading
      v.textContent = `${val.toFixed(1)} / ${(100 - val).toFixed(1)}`;
    });
    const lo = clamp01(oLoupe(t));
    loupe.style.opacity = lo.toFixed(3);
    loupe.style.visibility = lo < 0.004 ? "hidden" : "visible";
    loupe.style.transform = `translate(${(loupeLocal[0] - LOUPE_R).toFixed(2)}px,${(loupeLocal[1] - LOUPE_R).toFixed(2)}px) scale(${(0.7 + 0.3 * lo).toFixed(4)})`;
    loupeImg.style.transform = `translate(${(LOUPE_R - L.r * LOUPE_MAG).toFixed(2)}px,${(LOUPE_R - (loupeLocal[1] - CARD.y) * LOUPE_MAG).toFixed(2)}px)`;
    loupeLine.style.transform = `translateX(${(LOUPE_R + lineOff(t) * LOUPE_MAG).toFixed(2)}px)`;

    const ol = clamp01(oLooks(t));
    looks.style.opacity = ol.toFixed(3);
    looks.style.visibility = ol < 0.004 ? "hidden" : "visible";
    looks.style.width = `${looksW(t).toFixed(2)}px`;
    looks.style.background = rgb(looksBg(t));
    looks.style.transform = `translate(-50%,${((1 - ol) * 14).toFixed(2)}px) scale(${looksPress(t).toFixed(4)})`;
    looksLabel.style.opacity = clamp01(oLooksLabel(t)).toFixed(3);
    looksCheck.style.strokeDashoffset = Math.max(0, looksDraw(t)).toFixed(2);

    show(worth, oWorth(t));
    bars.forEach((bar, i) => {
      bar.fill.style.transform = `scaleX(${Math.max(0, barW[i](t)).toFixed(4)})`;
      bar.val.textContent = `+$${Math.max(0, Math.min(bar.v, count[i](t))).toFixed(2)}`;
      bar.val.style.opacity = clamp01(oCount[i](t)).toFixed(3);
    });
    bars[0].r.style.background = `rgba(0,160,220,${(0.1 * clamp01(hi(t))).toFixed(3)})`;

    show(grid, oGrid(t));
    tiles.forEach((tile, i) => {
      const o = clamp01(oTiles[i](t));
      tile.style.opacity = o.toFixed(3);
      tile.style.transform = `scale(${(0.92 + 0.08 * o).toFixed(4)})`;
      if (i === 0) tile.style.outlineColor = `rgba(20,22,26,${clamp01(sel(t)).toFixed(3)})`;
    });

    show(row, oRow(t));
    show(toast, oToast(t));
    toastCheck.style.strokeDashoffset = Math.max(0, toastDraw(t)).toFixed(2);

    const [wx, wy] = cur(t);
    const px = ((wx - cx) * z + W / 2) * scale, py = ((wy - cy) * z + W / 2) * scale;
    cursor.style.transform = `translate(${px.toFixed(2)}px,${py.toFixed(2)}px) scale(${(scale * curPress(t)).toFixed(4)})`;
  }

  const resize = () => { scale = stage.getBoundingClientRect().width / W || 1; };
  resize();

  // ---------- playback: requestAnimationFrame while on screen; paused off screen or in a hidden tab ----------
  let clock = POSTER_BEAT * BEAT, last = 0, raf = 0, visible = false;
  const frame = (now) => {
    raf = 0;
    if (!visible || document.hidden) { last = 0; return; }
    if (last) clock = (clock + Math.min(0.1, (now - last) / 1000)) % DURATION;
    last = now;
    seek(clock);
    raf = requestAnimationFrame(frame);
  };
  const play = () => { if (!raf && !still) raf = requestAnimationFrame(frame); };
  seek(clock);
  if (!still) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) play(); }, { threshold: 0.1 }).observe(stage);
    document.addEventListener("visibilitychange", play);
  }
  new ResizeObserver(() => { resize(); seek(clock); }).observe(stage);
  root.classList.add("is-live");
  return { seek(s) { clock = s; seek(s); }, duration: DURATION };
}

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  parent.appendChild(n);
  return n;
}
