/*
 * CenterMint "measure" loop — p5.js, rendered offline frame by frame.
 *
 * Deterministic: every pixel is a pure function of the frame index
 * (no wall clock, no Math.random). The loop is NF frames long and
 * frame NF === frame 0, so the encoded video loops seamlessly.
 *
 * Query params:
 *   ?w=1280&h=800   canvas size (rendered at pixelDensity 1, native size)
 *   ?render=1       don't animate; wait for window.renderFrame(i) calls
 */

// ---------- config ----------
const params = new URLSearchParams(location.search);
const W = parseInt(params.get('w') || '1280', 10);
const H = parseInt(params.get('h') || '800', 10);
const RENDER_MODE = params.get('render') === '1';

const FPS = 30;
const P = 110;               // frames per card cycle
const CARDS = [
  { art: 'bands',    lr: [50.8, 49.2], tb: [49.6, 50.4], tilt: -2.4 },
  { art: 'circles',  lr: [49.4, 50.6], tb: [50.2, 49.8], tilt:  2.1 },
  { art: 'halftone', lr: [58.4, 41.6], tb: [50.6, 49.4], tilt: -1.7, flagged: true },
  { art: 'diagonal', lr: [50.3, 49.7], tb: [48.9, 51.1], tilt:  2.6 },
];
const NF = P * CARDS.length; // 440 frames = 14.67 s
// Start the video mid-cycle so frame 0 already shows a fully measured card
// (the poster is frame 0, so poster -> playback has no visual jump).
const OFFSET = 74;

const COL = {
  mat: '#2E5B4F',
  stock: '#F3F5F7',
  cyan: '#00A0DC',
  magenta: '#D6247B',
  yellow: '#F2C200',
  ink: '#14161A',
  slate: '#6E8FA3',
  mist: '#B7C4CC',
  num: '#E8F0EC',
};

// ---------- small helpers ----------
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const seg = (t, a, d) => clamp01((t - a) / d);          // 0..1 progress of a segment
const lerp_ = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x, s = 1.6) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function mixHex(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const ch = (s) => Math.round(lerp_((a >> s) & 255, (b >> s) & 255, t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
// seeded PRNG (mulberry32) — used only for static art details
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- layout (adapts to aspect ratio) ----------
let L; // layout object
function computeLayout() {
  const u = Math.min(W, H) / 800;          // resolution unit for line weights / type
  const wide = W / H >= 1.1;
  let cardH, cardW, cx, cy;
  if (wide) {
    cardH = H * 0.62;
    cardW = cardH * 63 / 88;
    cx = W / 2 - 90 * u;                   // leave room for the T/B reading on the right
    cy = H * 0.45;
  } else {
    cardW = Math.min(W * 0.56, H * 0.6 * 63 / 88);
    cardH = cardW * 88 / 63;
    cx = W / 2;
    cy = H * 0.43;
  }
  const fs = (wide ? 27 : 32) * u;
  return {
    u, wide, cardW, cardH, cx, cy, fs,
    lw: Math.max(1, 1.5 * u),              // hairline weight
    border: cardW * 0.075,                 // nominal printed border (per side)
    radius: cardW * 0.045,
    ext: 30 * u,                           // how far measurement lines run past the card
    // number blocks, relative to card centre
    lrPos: wide ? { x: 0, y: cardH / 2 + 54 * u, align: 'center' }
                : { x: 0, y: cardH / 2 + 56 * u, align: 'center' },
    tbPos: wide ? { x: cardW / 2 + 58 * u, y: 0, align: 'left' }
                : { x: 0, y: cardH / 2 + 56 * u + fs * 1.9, align: 'center' },
    exitDist: cx + cardW / 2 + 90 * u,
  };
}

// ---------- p5 lifecycle ----------
let ctx, digitW, fontReady = false;

function setup() {
  pixelDensity(1);
  const c = createCanvas(W, H);
  c.id('stage');
  ctx = drawingContext;
  L = computeLayout();
  noLoop();
  // wait for the Archivo web font before any text is drawn
  document.fonts.load(`600 ${Math.round(L.fs)}px Archivo`).then(() => document.fonts.ready).then(() => {
    fontReady = true;
    setFont(L.fs, 600);
    // tabular figures by hand: every digit sits in a cell as wide as the widest digit
    digitW = Math.max(...'0123456789'.split('').map((d) => ctx.measureText(d).width));
    window.__ready = true;
    if (!RENDER_MODE) { frameRate(FPS); loop(); } else { renderFrame(0); }
  });
}

let currentFrame = 0;
window.renderFrame = function (i) {
  currentFrame = i;
  redraw();
};

function draw() {
  if (!fontReady) return;
  const f = RENDER_MODE ? currentFrame : (frameCount - 1) % NF;
  drawFrame(f);
}

function setFont(size, weight) {
  ctx.font = `${weight} ${size}px Archivo`;
}

// ---------- scene ----------
function drawFrame(f) {
  const tt = mod(f + OFFSET, NF);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  drawMat();

  // collect visible cards; draw the exiting one first so the arriving card sits on top
  const vis = [];
  for (let k = 0; k < CARDS.length; k++) {
    const t = mod(tt - k * P, NF);
    if (t < P + 16) vis.push({ k, t });
  }
  vis.sort((a, b) => b.t - a.t);
  for (const v of vis) drawCardCycle(CARDS[v.k], v.k, v.t);
}

function drawMat() {
  ctx.fillStyle = COL.mat;
  ctx.fillRect(0, 0, W, H);
  const s = W / 40;
  const lw = Math.max(1, L.u);
  ctx.lineWidth = lw;
  // pixel-snapped hairlines so the grid stays crisp
  const snap = (v) => Math.round(v) + (lw % 2 === 1 ? 0.5 : 0);
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? 'rgba(232,240,236,0.07)' : 'rgba(232,240,236,0.14)';
    ctx.beginPath();
    for (let i = 0; i * s <= W + 1; i++) {
      const major = i % 5 === 0;
      if ((pass === 1) !== major) continue;
      const x = snap(i * s);
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (let j = 0; j * s <= H + 1; j++) {
      const major = j % 5 === 0;
      if ((pass === 1) !== major) continue;
      const y = snap(j * s);
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();
  }
  // ruler ticks + numbers along the top edge
  ctx.strokeStyle = 'rgba(232,240,236,0.16)';
  ctx.beginPath();
  for (let i = 0; i * s <= W + 1; i++) {
    const x = snap(i * s);
    const len = (i % 5 === 0 ? 10 : 5) * L.u;
    ctx.moveTo(x, 0); ctx.lineTo(x, len);
  }
  ctx.stroke();
  setFont(Math.max(8, 9.5 * L.u), 500);
  ctx.fillStyle = 'rgba(232,240,236,0.2)';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let i = 5; i * s < W - 10; i += 5) ctx.fillText(String(i), i * s + 3 * L.u, 12 * L.u);
}

// Geometry of one card, in card-local coordinates (origin = card centre).
function cardGeom(card) {
  const { cardW: cw, cardH: ch, border: b } = L;
  const left = 2 * b * card.lr[0] / 100;
  const right = 2 * b * card.lr[1] / 100;
  const top = 2 * b * card.tb[0] / 100;
  const bottom = 2 * b * card.tb[1] / 100;
  const X0 = -cw / 2, Y0 = -ch / 2, X1 = cw / 2, Y1 = ch / 2;
  return { X0, Y0, X1, Y1, ix0: X0 + left, ix1: X1 - right, iy0: Y0 + top, iy1: Y1 - bottom };
}

function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCardCycle(card, k, t) {
  const { u } = L;
  const g = cardGeom(card);

  // --- drop (0..26) ---
  const pd = seg(t, 0, 26);
  const eDrop = easeOutCubic(pd);
  const scl = lerp_(1.08, 1, eDrop);
  const rot = (card.tilt * Math.PI / 180) * (1 - easeOutBack(pd, 1.2));
  const dy = lerp_(-18 * u, 0, eDrop);
  const alpha = easeOutCubic(seg(t, 0, 6));

  // --- exit (96..126): conveyor slide to the left while the next card drops in ---
  const pe = seg(t, 96, 30);
  const dx = -easeInOutCubic(pe) * L.exitDist;

  ctx.save();
  ctx.translate(L.cx + dx, L.cy + dy);
  ctx.rotate(rot);
  ctx.scale(scl, scl);
  ctx.globalAlpha = alpha;

  // card body with a shadow that tightens as it lands
  ctx.save();
  ctx.shadowColor = `rgba(6,20,16,${lerp_(0.22, 0.42, eDrop)})`;
  ctx.shadowBlur = lerp_(46, 16, eDrop) * u;
  ctx.shadowOffsetY = lerp_(30, 7, eDrop) * u;
  ctx.shadowOffsetX = lerp_(6, 1, eDrop) * u;
  roundRectPath(g.X0, g.Y0, L.cardW, L.cardH, L.radius);
  ctx.fillStyle = COL.stock;
  ctx.fill();
  ctx.restore();

  // printed art
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.ix0, g.iy0, g.ix1 - g.ix0, g.iy1 - g.iy0);
  ctx.clip();
  drawArt(card.art, g.ix0, g.iy0, g.ix1 - g.ix0, g.iy1 - g.iy0, k);
  ctx.restore();

  const overlayFade = 1 - easeOutCubic(seg(t, 96, 10)); // numbers fade as the card leaves
  const flagT = card.flagged ? easeInOutCubic(seg(t, 58, 12)) : 0;

  drawFlagHighlight(g, flagT, alpha);
  drawMeasureLines(g, t, flagT);
  drawCropMarks(g, t);
  drawRegMarks(g, t);
  ctx.globalAlpha = alpha * overlayFade;
  drawReadings(card, t, flagT);
  ctx.restore();
}

// ---------- art (flat colour + simple geometry only) ----------
function drawArt(kind, x, y, w, h, k) {
  const R = rng(1000 + k * 97);
  if (kind === 'bands') {
    ctx.fillStyle = COL.mist; ctx.fillRect(x, y, w, h);
    const stops = [[COL.ink, 0.16], [COL.cyan, 0.34], [COL.yellow, 0.06], [COL.magenta, 0.2], [COL.slate, 0.24]];
    let yy = y;
    for (const [c, p] of stops) { ctx.fillStyle = c; ctx.fillRect(x, yy, w, h * p + 1); yy += h * p; }
    ctx.fillStyle = COL.yellow;
    ctx.beginPath(); ctx.arc(x + w * 0.68, y + h * 0.36, w * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.stock;
    for (let i = 0; i < 7; i++) ctx.fillRect(x + w * 0.1 + i * w * 0.045, y + h * 0.84, w * 0.018, h * 0.1);
  } else if (kind === 'circles') {
    ctx.fillStyle = COL.slate; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = COL.mist; ctx.fillRect(x, y + h * 0.66, w, h * 0.34);
    const cx = x + w * 0.42, cy = y + h * 0.5;
    const rings = [[COL.yellow, 0.52], [COL.slate, 0.4], [COL.cyan, 0.3], [COL.stock, 0.17], [COL.ink, 0.08]];
    for (const [c, r] of rings) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, w * r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = COL.magenta;
    ctx.beginPath(); ctx.arc(x + w * 0.8, y + h * 0.18, w * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.ink; ctx.fillRect(x, y + h * 0.9, w, h * 0.02);
  } else if (kind === 'halftone') {
    // no magenta in the flagged card's art, so the magenta flag reads cleanly
    ctx.fillStyle = COL.mist; ctx.fillRect(x, y, w, h);
    const step = w / 13;
    for (let j = 0; j * step < h + step; j++) {
      for (let i = 0; i * step < w + step; i++) {
        const px = x + i * step + (j % 2 ? step / 2 : 0), py = y + j * step;
        const d = Math.hypot((px - (x + w * 0.3)) / w, (py - (y + h * 0.3)) / h);
        const r = step * 0.46 * clamp01(1.05 - d * 1.35);
        if (r < 0.4) continue;
        ctx.fillStyle = COL.cyan;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = COL.ink; ctx.fillRect(x, y + h * 0.82, w, h * 0.18);
    ctx.fillStyle = COL.yellow; ctx.fillRect(x, y + h * 0.8, w, h * 0.025);
    ctx.fillStyle = COL.slate;
    for (let i = 0; i < 4; i++) ctx.fillRect(x + w * 0.62 + i * w * 0.08, y + h * 0.87, w * 0.05, h * 0.08 * (0.4 + R() * 0.6));
  } else if (kind === 'diagonal') {
    ctx.fillStyle = COL.yellow; ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(-Math.PI / 4);
    const D = Math.hypot(w, h);
    const bands = [[COL.ink, -0.34, 0.1], [COL.magenta, -0.16, 0.16], [COL.cyan, 0.08, 0.06], [COL.ink, 0.2, 0.025], [COL.slate, 0.3, 0.12]];
    for (const [c, o, th] of bands) { ctx.fillStyle = c; ctx.fillRect(-D, o * D, 2 * D, th * D); }
    ctx.restore();
    ctx.fillStyle = COL.stock;
    ctx.beginPath(); ctx.arc(x + w * 0.26, y + h * 0.74, w * 0.09, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- measurement overlay ----------
function drawFlagHighlight(g, flagT, alpha) {
  if (flagT <= 0) return;
  const { u } = L;
  // tint the wide (left) border and put a dimension arrow across it
  ctx.save();
  ctx.globalAlpha = alpha * flagT;
  ctx.fillStyle = hexA(COL.magenta, 0.14);
  ctx.fillRect(g.X0, g.iy0, g.ix0 - g.X0, g.iy1 - g.iy0);
  const y = (g.iy0 + g.iy1) / 2;
  const a = g.X0 + 3 * u, b = g.ix0 - 3 * u, ah = 4 * u;
  ctx.strokeStyle = COL.magenta; ctx.fillStyle = COL.magenta;
  ctx.lineWidth = L.lw;
  ctx.beginPath(); ctx.moveTo(a + ah, y); ctx.lineTo(b - ah, y); ctx.stroke();
  for (const [px, dir] of [[a, 1], [b, -1]]) {
    ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + dir * ah * 1.6, y - ah); ctx.lineTo(px + dir * ah * 1.6, y + ah); ctx.closePath(); ctx.fill();
  }
  // bracket on the mat, outside the wide side
  const bx = g.X0 - 12 * u, h2 = 22 * u;
  ctx.lineWidth = L.lw * 1.6;
  ctx.beginPath();
  ctx.moveTo(bx + 6 * u, y - h2); ctx.lineTo(bx, y - h2); ctx.lineTo(bx, y + h2); ctx.lineTo(bx + 6 * u, y + h2);
  ctx.moveTo(bx, y); ctx.lineTo(bx - 7 * u, y);
  ctx.stroke();
  ctx.restore();
}

// A hairline that reads on both surfaces: light on the mat, ink on the card.
function twoToneLine(g, x1, y1, x2, y2, outCol, inCol, a, lw = L.lw) {
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = outCol;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  roundRectPath(g.X0, g.Y0, L.cardW, L.cardH, L.radius);
  ctx.clip();
  ctx.strokeStyle = inCol;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

function drawMeasureLines(g, t, flagT) {
  const { u, ext } = L;
  const start = 22, dur = 13, far = 46 * u;
  const lrOut = mixHex('#E8F0EC', COL.magenta, flagT);
  const lrIn = mixHex('#14161A', COL.magenta, flagT);
  const lines = [
    // [delay, axis, target, direction the line comes from]
    [0, 'v', g.ix0, -1, true],
    [2, 'v', g.ix1, 1, true],
    [4, 'h', g.iy0, -1, false],
    [6, 'h', g.iy1, 1, false],
  ];
  for (const [d, axis, target, dir, isLR] of lines) {
    const p = seg(t, start + d, dur);
    if (p <= 0) continue;
    const pos = target + dir * far * (1 - easeOutBack(p, 2.2));
    const a = easeOutCubic(seg(t, start + d, 5));
    const outC = isLR ? lrOut : 'rgba(232,240,236,0.9)';
    const inC = isLR ? lrIn : 'rgba(20,22,26,0.85)';
    // flagged lines get slightly heavier: magenta has little luminance contrast on the green mat
    const lw = isLR ? L.lw * (1 + 0.5 * flagT) : L.lw;
    if (axis === 'v') twoToneLine(g, pos, g.Y0 - ext, pos, g.Y1 + ext, outC, inC, a, lw);
    else twoToneLine(g, g.X0 - ext, pos, g.X1 + ext, pos, outC, inC, a, lw);
  }
}

function drawCropMarks(g, t) {
  const { u } = L;
  const p = easeOutCubic(seg(t, 28, 12));
  if (p <= 0) return;
  const gap = 7 * u, len = 16 * u * p;
  ctx.save();
  ctx.strokeStyle = 'rgba(232,240,236,0.8)';
  ctx.lineWidth = L.lw;
  ctx.beginPath();
  for (const [x, y, sx, sy] of [[g.X0, g.Y0, -1, -1], [g.X1, g.Y0, 1, -1], [g.X0, g.Y1, -1, 1], [g.X1, g.Y1, 1, 1]]) {
    ctx.moveTo(x + sx * gap, y); ctx.lineTo(x + sx * (gap + len), y);
    ctx.moveTo(x, y + sy * gap); ctx.lineTo(x, y + sy * (gap + len));
  }
  ctx.stroke();
  ctx.restore();
}

// CMY registration marks: three layers start mis-registered and converge.
// Multiply blending makes perfect overlap read as near-black.
function drawRegMarks(g, t) {
  const { u } = L;
  const r = 5.5 * u, arm = 9.5 * u, delta = 9 * u;
  const layers = [
    [COL.cyan, -1.0, -0.55, 0],
    [COL.magenta, 0.95, -0.35, 2],
    [COL.yellow, 0.15, 1.0, 4],
  ];
  const corners = [[g.ix0, g.iy0], [g.ix1, g.iy0], [g.ix0, g.iy1], [g.ix1, g.iy1]];
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.lineWidth = Math.max(1, 1.3 * u);
  for (const [col, ox, oy, d] of layers) {
    const p = seg(t, 32 + d, 22);
    if (p <= 0) continue;
    const e = 1 - easeOutCubic(p);
    ctx.globalAlpha = easeOutCubic(seg(t, 32 + d, 6));
    ctx.strokeStyle = col;
    ctx.beginPath();
    for (const [cx0, cy0] of corners) {
      const cx = cx0 + ox * delta * e, cy = cy0 + oy * delta * e;
      ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
      ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- numbers ----------
function fmt(v) { return v.toFixed(1); }

// width of a string laid out with tabular digits
function tabWidth(str) {
  let w = 0;
  for (const ch of str) w += /\d/.test(ch) ? digitW : ctx.measureText(ch).width;
  return w;
}

// Draws a string whose characters roll up into place one after another
// (each glyph rises from below its slot while fading in, clipped to the line box).
function rollText(str, x, y, t0, t, color) {
  const lh = L.fs * 1.2;
  let cx = x, i = 0;
  for (const ch of str) {
    const isDigit = /\d/.test(ch);
    const w = isDigit ? digitW : ctx.measureText(ch).width;
    const p = seg(t, t0 + i * 1.3, 12);
    if (p > 0 && ch !== ' ') {
      const e = easeOutCubic(p);
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - 2, y - lh / 2, w + 4, lh); ctx.clip();
      ctx.globalAlpha *= e;
      ctx.fillStyle = color;
      ctx.fillText(ch, cx + w / 2, y + (1 - e) * lh * 0.75);
      ctx.restore();
    }
    cx += w; i++;
  }
}

// small arrow glyphs (drawn, not typed): axis 'h' = ↔, 'v' = ↕
function axisIcon(axis, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = L.lw;
  const a = s * 0.5, h = s * 0.2;
  ctx.beginPath();
  if (axis === 'h') {
    ctx.moveTo(x - a + h, y); ctx.lineTo(x + a - h, y); ctx.stroke();
    for (const dir of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + dir * a, y); ctx.lineTo(x + dir * (a - h * 1.6), y - h); ctx.lineTo(x + dir * (a - h * 1.6), y + h); ctx.closePath(); ctx.fill(); }
  } else {
    ctx.moveTo(x, y - a + h); ctx.lineTo(x, y + a - h); ctx.stroke();
    for (const dir of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, y + dir * a); ctx.lineTo(x - h, y + dir * (a - h * 1.6)); ctx.lineTo(x + h, y + dir * (a - h * 1.6)); ctx.closePath(); ctx.fill(); }
  }
  ctx.restore();
}

function drawReading(axis, vals, pos, t0, t, flagT) {
  const { u, fs } = L;
  setFont(fs, 600);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const str = `${fmt(vals[0])} / ${fmt(vals[1])}`;
  const iconW = fs * 0.9, gap = fs * 0.45;
  const total = iconW + gap + tabWidth(str);
  const x0 = pos.align === 'center' ? pos.x - total / 2 : pos.x;
  const y = pos.y;
  const baseA = ctx.globalAlpha;
  const a = easeOutCubic(seg(t, t0, 8));
  if (a <= 0) return;
  ctx.globalAlpha = baseA * a;

  // flagged reading sits on a near-white tag so magenta keeps its contrast on the green mat
  if (flagT > 0) {
    const padX = fs * 0.5, padY = fs * 0.36;
    ctx.save();
    ctx.globalAlpha = baseA * a * flagT;
    roundRectPath(x0 - padX, y - fs / 2 - padY, total + padX * 2, fs + padY * 2, (fs + padY * 2) / 2);
    ctx.fillStyle = COL.stock;
    ctx.fill();
    ctx.restore();
  }
  const col = mixHex(COL.num, COL.magenta, flagT);
  axisIcon(axis, x0 + iconW / 2, y, iconW * 0.9, col);
  rollText(str, x0 + iconW + gap, y + fs * 0.04, t0, t, col);
  ctx.globalAlpha = baseA;
}

function drawReadings(card, t, flagT) {
  drawReading('h', card.lr, L.lrPos, 44, t, flagT);
  drawReading('v', card.tb, L.tbPos, 50, t, 0);
}

// expose for the renderer
window.LOOP_FRAMES = NF;
window.LOOP_FPS = FPS;
window.LOOP_OFFSET = OFFSET;
