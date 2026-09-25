/*
 * CenterMint "watch it measure" loop — p5.js, rendered offline frame by frame.
 *
 * A real card (1999 Pokémon Base Set Charizard, from a scan) lies on the cutting mat.
 * A loupe travels to the four printed borders; on each side the measuring line slides
 * in from the artwork and settles on the inner edge of the yellow border. Then the CMY
 * registration marks converge on the inner corners and the readout checks the ratios
 * against the PSA 10 front reference (55/45). No words: numbers and drawn glyphs only,
 * so one video serves every language page.
 *
 * Line positions come from tools/src/art/real/charizard-measure.json and the ratios from
 * charizard-app.json (the same files the site build uses), so the video agrees with the page.
 *
 * Deterministic: every frame is a pure function of its index. Frame NF == frame 0.
 * Query: ?w=1280&h=800 (canvas size), ?render=1 (wait for window.renderFrame(i)).
 */
const params = new URLSearchParams(location.search);
const W = parseInt(params.get('w') || '1280', 10);
const H = parseInt(params.get('h') || '800', 10);
const RENDER_MODE = params.get('render') === '1';

const FPS = 30;
const NF = 480;              // 16 s loop
// Video frame 0 shows the finished measurement (also the poster), so play starts without a jump.
const OFFSET = 340;

const COL = {
  mat: '#2E5B4F', matInk: '#E8F0EC', matInk2: '#B9CCC4',
  cyan: '#00A0DC', magenta: '#D6247B', yellow: '#F2C200', ink: '#14161A',
};

let img, M, APP, small;           // full-res card, measurement, pre-scaled card for the overview
let cam;                     // overview placement: card top-left (x, y) and scale s (screen px per card px)

const clamp01 = x => Math.max(0, Math.min(1, x));
const seg = (t, a, d) => clamp01((t - a) / d);
const lerp_ = (a, b, t) => a + (b - a) * t;
const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = x => 1 - Math.pow(1 - x, 3);
const easeBack = (x, s = 1.7) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function preload() {
  img = loadImage('../src/art/real/charizard-flat.png');
  M = loadJSON('../src/art/real/charizard-measure.json');
  APP = loadJSON('../src/art/real/charizard-app.json');
}

function setup() {
  pixelDensity(1);
  const c = createCanvas(W, H);
  c.id('stage');
  noLoop();
  const s = (H * 0.8) / M.size[1];
  cam = { s, x: Math.round(W * 0.31 - (M.size[0] * s) / 2), y: Math.round((H - M.size[1] * s) / 2) };
  // High-quality downscale once (halving steps), so the overview card is sharp and cheap to draw.
  let src = img.canvas, w = src.width, h = src.height;
  const tw = Math.round(M.size[0] * s), th = Math.round(M.size[1] * s);
  while (w / 2 > tw) {
    const cv = document.createElement('canvas'); cv.width = Math.round(w / 2); cv.height = Math.round(h / 2);
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, cv.width, cv.height);
    src = cv; w = cv.width; h = cv.height;
  }
  small = document.createElement('canvas'); small.width = tw; small.height = th;
  const g = small.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, tw, th);

  // Numbers on screen are the app's own reading (as in the App screenshots); lines use the measured border pixels.
  M.lr = APP.lr; M.tb = APP.tb;
  document.fonts.load('720 40px Archivo').then(() => document.fonts.ready).then(() => {
    window.LOOP_FRAMES = NF;
    window.POSTER_FRAME = 0;
    window.__ready = true;
    if (!RENDER_MODE) { frameRate(FPS); loop(); } else { window.renderFrame(0); }
  });
}

window.renderFrame = function (i) { drawFrame((i + OFFSET) % NF); };
function draw() { if (window.__ready && !RENDER_MODE) drawFrame((frameCount + OFFSET) % NF); }

// ---------- geometry ----------
const B = () => M.border_px;                                  // printed border widths (card px)
const inner = () => ({ l: B().l, r: M.size[0] - B().r, t: B().t, b: M.size[1] - B().b });
const sx = x => cam.x + x * cam.s;                            // card px -> screen
const sy = y => cam.y + y * cam.s;

// ---------- timeline (t in 0..NF) ----------
// Each side: [loupe arrives, line settles]. Loupe path visits l, r, t, b.
const SIDES = [
  { k: 'l', arrive: 44, settle: 62 },
  { k: 'r', arrive: 92, settle: 110 },
  { k: 't', arrive: 140, settle: 158 },
  { k: 'b', arrive: 188, settle: 206 },
];
const LOUPE_IN = 24, LOUPE_OUT = 222;
const REG_AT = 226, READ_AT = 250, GAUGE_AT = 272;
const FADE_AT = 404, FADE_LEN = 30;

function drawFrame(t) {
  const ctx = drawingContext;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const fadeOut = 1 - seg(t, FADE_AT, FADE_LEN);               // overlays leave together before the loop restarts
  drawMat(ctx);
  drawCard(ctx);
  drawTrim(ctx, seg(t, 6, 16) * fadeOut);
  for (const side of SIDES) drawLine(ctx, side, t, fadeOut);
  drawSideLabels(ctx, t, fadeOut);
  drawReg(ctx, t, fadeOut);
  drawLoupe(ctx, t);
  drawReadout(ctx, t, fadeOut);
}

function drawMat(ctx) {
  ctx.fillStyle = COL.mat; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 1;
  for (const [step, a] of [[20, 0.045], [100, 0.10]]) {
    ctx.strokeStyle = hexA(COL.matInk, a);
    ctx.beginPath();
    for (let x = 0.5; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0.5; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }
}

function drawCard(ctx) {
  const w = small.width, h = small.height;
  ctx.save();
  ctx.shadowColor = 'rgba(8,20,16,0.45)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 14;
  ctx.fillStyle = 'rgba(0,0,0,1)';
  const r = w * 3.18 / 63;
  ctx.beginPath(); ctx.roundRect(cam.x + 2, cam.y + 2, w - 4, h - 4, r); ctx.fill();
  ctx.restore();
  ctx.drawImage(small, cam.x, cam.y);
}

function drawTrim(ctx, a) {
  if (a <= 0) return;
  const x0 = cam.x, y0 = cam.y, x1 = cam.x + small.width, y1 = cam.y + small.height, o = 10, l = 26;
  ctx.strokeStyle = hexA(COL.matInk, 0.9 * a); ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]]) {
    ctx.moveTo(x + dx * o, y); ctx.lineTo(x + dx * (o + l), y);
    ctx.moveTo(x, y + dy * o); ctx.lineTo(x, y + dy * (o + l));
  }
  ctx.stroke();
}

// Where the measuring line for one side is (card px), given time: slides in from the artwork, settles with a small overshoot.
function linePos(side, t) {
  const I = inner();
  const target = I[side.k];
  const dir = { l: 1, r: -1, t: 1, b: -1 }[side.k];         // "inwards" direction
  const p = seg(t, side.arrive - 8, side.settle - side.arrive + 8);
  return target + dir * 220 * (1 - easeBack(p, 2.2));
}

function drawLine(ctx, side, t, fadeOut) {
  const a = seg(t, side.arrive - 8, 6) * fadeOut;
  if (a <= 0) return;
  const settled = t >= side.settle;
  const v = linePos(side, t);
  const ext = 40;
  ctx.strokeStyle = hexA(COL.cyan, a); ctx.lineWidth = settled ? 1.5 : 2;
  ctx.beginPath();
  if (side.k === 'l' || side.k === 'r') { ctx.moveTo(sx(v), cam.y - ext); ctx.lineTo(sx(v), cam.y + small.height + ext); }
  else { ctx.moveTo(cam.x - ext, sy(v)); ctx.lineTo(cam.x + small.width + ext, sy(v)); }
  ctx.stroke();
}

function fmt(x) { return x.toFixed(1); }

function drawSideLabels(ctx, t, fadeOut) {
  ctx.font = '720 22px Archivo'; ctx.textBaseline = 'middle';
  const lr = M.lr, tb = M.tb;
  const aLR = easeOut(seg(t, SIDES[1].settle + 2, 12)) * fadeOut;
  const aTB = easeOut(seg(t, SIDES[3].settle + 2, 12)) * fadeOut;
  const midY = cam.y + small.height / 2, midX = cam.x + small.width / 2;
  if (aLR > 0) {
    ctx.fillStyle = hexA(COL.matInk, aLR);
    ctx.textAlign = 'right'; ctx.fillText(fmt(lr[0]), cam.x - 14, midY);
    ctx.textAlign = 'left'; ctx.fillText(fmt(lr[1]), cam.x + small.width + 14, midY);
  }
  if (aTB > 0) {
    ctx.fillStyle = hexA(COL.matInk, aTB);
    ctx.textAlign = 'center';
    ctx.fillText(fmt(tb[0]), midX, cam.y - 22);
    ctx.fillText(fmt(tb[1]), midX, cam.y + small.height + 24);
  }
}

// CMY registration marks fly to the four inner corners; multiplied, a perfect fit prints black.
function drawReg(ctx, t, fadeOut) {
  const a = seg(t, REG_AT, 8) * fadeOut;
  if (a <= 0) return;
  const I = inner();
  const offs = [[COL.cyan, -26, -18, 0], [COL.magenta, 22, -20, 3], [COL.yellow, -6, 26, 6]];
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (const [x, y] of [[I.l, I.t], [I.r, I.t], [I.l, I.b], [I.r, I.b]]) {
    for (const [col, dx, dy, delay] of offs) {
      const p = easeBack(seg(t, REG_AT + 4 + delay, 16), 1.4);
      const cx = sx(x) + dx * (1 - p), cy = sy(y) + dy * (1 - p);
      ctx.strokeStyle = hexA(col, a); ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------- loupe ----------
function loupeTarget(t) {
  const I = inner(), mx = M.size[0] / 2, my = M.size[1] / 2;
  // Lens centred on the middle of each printed border, so the cut edge, the border and the inner edge are all in view.
  const pts = { l: [B().l / 2, my], r: [M.size[0] - B().r / 2, my], t: [mx, B().t / 2], b: [mx, M.size[1] - B().b / 2] };
  const start = [I.l + 260, my];
  let from = start, to = pts.l, p = 1;
  if (t < SIDES[0].arrive) { from = start; to = pts.l; p = seg(t, LOUPE_IN, SIDES[0].arrive - LOUPE_IN); }
  else {
    for (let i = 0; i < SIDES.length; i++) {
      const s = SIDES[i], next = SIDES[i + 1];
      if (!next || t < next.arrive) {
        const leave = s.settle + 6;
        if (!next || t < leave) return pts[s.k];
        from = pts[s.k]; to = pts[next.k]; p = seg(t, leave, next.arrive - leave);
        break;
      }
    }
  }
  const e = easeInOut(p);
  // Travel on a gentle arc through the card centre side, so the loupe never leaves the card between edges.
  const bow = Math.sin(Math.PI * e) * 0.18;
  return [lerp_(from[0], to[0], e) + (mx - lerp_(from[0], to[0], e)) * bow, lerp_(from[1], to[1], e) + (my - lerp_(from[1], to[1], e)) * bow];
}

function drawLoupe(ctx, t) {
  const a = easeOut(seg(t, LOUPE_IN, 12)) * (1 - easeOut(seg(t, LOUPE_OUT, 12)));
  if (a <= 0) return;
  const [wx, wy] = loupeTarget(t);
  const R = 150 * (0.85 + 0.15 * a);
  const Z = 1.6;                                              // card px -> loupe px
  const cx = sx(wx), cy = sy(wy);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.shadowColor = 'rgba(8,20,16,0.5)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = COL.mat; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  // mat grid inside the lens, magnified
  ctx.strokeStyle = hexA(COL.matInk, 0.08); ctx.lineWidth = 1;
  const g = 20 * Z / cam.s;                                    // mat grid pitch, magnified like the card
  ctx.beginPath();
  for (let x = cx - R - ((cx - R) % g); x < cx + R; x += g) { ctx.moveTo(x, cy - R); ctx.lineTo(x, cy + R); }
  for (let y = cy - R - ((cy - R) % g); y < cy + R; y += g) { ctx.moveTo(cx - R, y); ctx.lineTo(cx + R, y); }
  ctx.stroke();
  // the real scan at full resolution
  const half = R / Z;
  const sx0 = wx - half, sy0 = wy - half;
  const cr = M.size[0] * 3.18 / 63;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(cx - wx * Z, cy - wy * Z, M.size[0] * Z, M.size[1] * Z, cr * Z); ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  const cx0 = Math.max(0, sx0), cy0 = Math.max(0, sy0), cx1 = Math.min(M.size[0], wx + half), cy1 = Math.min(M.size[1], wy + half);
  if (cx1 > cx0 && cy1 > cy0) {
    ctx.drawImage(img.canvas, cx0, cy0, cx1 - cx0, cy1 - cy0, cx + (cx0 - wx) * Z, cy + (cy0 - wy) * Z, (cx1 - cx0) * Z, (cy1 - cy0) * Z);
  }
  ctx.restore();
  // measuring lines, magnified
  const I = inner();
  for (const side of SIDES) {
    const la = seg(t, side.arrive - 8, 6);
    if (la <= 0) continue;
    const v = linePos(side, t);
    ctx.strokeStyle = hexA(COL.cyan, la); ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (side.k === 'l' || side.k === 'r') { const x = cx + (v - wx) * Z; ctx.moveTo(x, cy - R); ctx.lineTo(x, cy + R); }
    else { const y = cy + (v - wy) * Z; ctx.moveTo(cx - R, y); ctx.lineTo(cx + R, y); }
    ctx.stroke();
    // once settled, bracket the printed border (card edge to inner edge) in magenta
    const ba = seg(t, side.settle, 8);
    if (ba > 0) {
      ctx.strokeStyle = hexA(COL.magenta, ba); ctx.lineWidth = 2;
      ctx.beginPath();
      if (side.k === 'l' || side.k === 'r') {
        const edge = side.k === 'l' ? 0 : M.size[0];
        const x0 = cx + (edge - wx) * Z, x1 = cx + (I[side.k] - wx) * Z, y = cy + 34;
        ctx.moveTo(x0, y - 7); ctx.lineTo(x0, y + 7); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.moveTo(x1, y - 7); ctx.lineTo(x1, y + 7);
      } else {
        const edge = side.k === 't' ? 0 : M.size[1];
        const y0 = cy + (edge - wy) * Z, y1 = cy + (I[side.k] - wy) * Z, x = cx + 34;
        ctx.moveTo(x - 7, y0); ctx.lineTo(x + 7, y0); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.moveTo(x - 7, y1); ctx.lineTo(x + 7, y1);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
  // rim: ink ring with a thin CMY fringe, and a registration cross in the middle
  ctx.save();
  ctx.globalAlpha = a;
  for (const [col, d] of [[COL.cyan, -1.5], [COL.magenta, 1.5]]) {
    ctx.strokeStyle = hexA(col, 0.55); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx + d, cy, R + 1, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = hexA(COL.ink, 0.55); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9); ctx.stroke();
  ctx.restore();
}

// ---------- readout (right column): ratios roll in, then the PSA 10 front gauge ----------
function drawArrow(ctx, x, y, vertical) {
  ctx.save(); ctx.translate(x, y); if (vertical) ctx.rotate(Math.PI / 2);
  ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0);
  ctx.moveTo(-13, 0); ctx.lineTo(-7, -6); ctx.moveTo(-13, 0); ctx.lineTo(-7, 6);
  ctx.moveTo(13, 0); ctx.lineTo(7, -6); ctx.moveTo(13, 0); ctx.lineTo(7, 6);
  ctx.stroke(); ctx.restore();
}

function drawReadout(ctx, t, fadeOut) {
  const x0 = Math.round(W * 0.575), y0 = Math.round(H * 0.36);
  const rows = [[M.lr, false, READ_AT], [M.tb, true, READ_AT + 8]];
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  rows.forEach(([vals, vertical, at], i) => {
    const a = easeOut(seg(t, at, 12)) * fadeOut;
    if (a <= 0) return;
    const roll = easeOut(seg(t, at, 26));                     // digits count up from 50.0 / 50.0
    const va = lerp_(50, vals[0], roll), vb = 100 - va;
    const y = y0 + i * 92 + (1 - a) * 8;
    ctx.strokeStyle = hexA(COL.cyan, a); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    drawArrow(ctx, x0 + 16, y - 20, vertical);
    ctx.fillStyle = hexA(COL.matInk, a);
    ctx.font = '720 64px Archivo';
    ctx.fillText(`${fmt(va)} / ${fmt(vb)}`, x0 + 56, y);
  });
  // gauge: 50/50 ... 55/45 (PSA 10 front) ... 60/40
  const ga = easeOut(seg(t, GAUGE_AT, 14)) * fadeOut;
  if (ga <= 0) return;
  const gx = x0 + 4, gy = y0 + 250, gw = Math.round(W * 0.3);
  const X = v => gx + ((v - 50) / 10) * gw;
  ctx.fillStyle = hexA(COL.cyan, 0.55 * ga); ctx.fillRect(X(50), gy - 14, X(55) - X(50), 14);
  ctx.strokeStyle = hexA(COL.matInk, 0.9 * ga); ctx.lineWidth = 2; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(X(50), gy); ctx.lineTo(X(60), gy);
  for (const v of [50, 55, 60]) { ctx.moveTo(X(v), gy - 7); ctx.lineTo(X(v), gy + 7); }
  ctx.stroke();
  ctx.font = '600 20px Archivo'; ctx.textAlign = 'center'; ctx.fillStyle = hexA(COL.matInk2, ga);
  for (const v of [50, 55, 60]) ctx.fillText(`${v}/${100 - v}`, X(v), gy + 36);
  const worst = Math.max(M.lr[0], M.lr[1]);
  const mv = lerp_(50, worst, easeOut(seg(t, GAUGE_AT + 6, 24)));
  ctx.fillStyle = hexA(COL.cyan, ga);
  ctx.beginPath(); ctx.moveTo(X(mv), gy - 18); ctx.lineTo(X(mv) - 9, gy - 33); ctx.lineTo(X(mv) + 9, gy - 33); ctx.closePath(); ctx.fill();
  ctx.font = '720 24px Archivo'; ctx.fillStyle = hexA(COL.matInk, ga);
  ctx.fillText(fmt(mv), X(mv), gy - 44);
  // inside the reference: a drawn check mark next to 55/45
  const ca = easeOut(seg(t, GAUGE_AT + 32, 10)) * fadeOut;
  if (ca > 0 && worst <= 55) {
    ctx.strokeStyle = hexA(COL.cyan, ca); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const cx = X(60) + 44, cy = gy - 6;
    ctx.beginPath(); ctx.moveTo(cx - 12, cy); ctx.lineTo(cx - 3, cy + 9); ctx.lineTo(cx + 14, cy - 12); ctx.stroke();
  }
}
