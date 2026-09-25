// "One shape" loops: six short animations, one per app task, each a single element that never cuts.
//
// Every style is a pure function of time: seek(t) evaluates closed-form springs. A property is a list of keys
// [beat, value, response]; each key starts a spring from the previous target to the new one and the springs add
// up, so retargeting mid-flight stays continuous. Each track ends on its first value and the previous loop's
// springs are added in, so the last frame flows into the first. No CSS transitions, timers or stored state.
// 120 BPM. Black, white and greys only; the card scan keeps its own colours.
//
// Mounted per segment by assets/js/home.js; tools/flow-video/render.py seeks frame by frame to make the videos.

const BEAT = 0.5;
const W = 1080;                                   // design units: every stage is W x W, centre 540, 540
const INK = [20, 22, 26], WHITE = [255, 255, 255], HOVER = [52, 55, 62];
const G_TRACK = [232, 233, 235], G_FIELD = [241, 241, 239], G_MID = [120, 125, 133];

// ---------- closed-form spring (step response 0 -> 1); damping 0.86 gives about 0.6 % overshoot ----------
const ZETA = 0.86;
function spring(dt, resp) {
  if (dt <= 0) return 0;
  const w = (2 * Math.PI) / resp, wd = w * Math.sqrt(1 - ZETA * ZETA), a = ZETA * w;
  if (a * dt > 14) return 1;
  return 1 - Math.exp(-a * dt) * (Math.cos(wd * dt) + (a / wd) * Math.sin(wd * dt));
}
// keys: [[beat, value, resp?], ...], numbers or arrays; the last key must equal the first (checked).
function tracks(T) {
  return (keys, resp = 0.42) => {
    const v0 = keys[0][1], arr = Array.isArray(v0);
    const last = keys[keys.length - 1][1];
    if (JSON.stringify(last) !== JSON.stringify(v0)) throw new Error(`track does not loop: ${JSON.stringify(keys)}`);
    const ks = [];
    for (let i = 1; i < keys.length; i++) {
      const prev = keys[i - 1][1], cur = keys[i][1];
      ks.push({ t: keys[i][0] * BEAT, r: keys[i][2] || resp, d: arr ? cur.map((c, j) => c - prev[j]) : cur - prev });
    }
    if (arr) return (t) => {
      const out = v0.slice();
      for (const k of ks) { const s = spring(t - k.t, k.r) + spring(t + T - k.t, k.r); for (let j = 0; j < out.length; j++) out[j] += k.d[j] * s; }
      return out;
    };
    return (t) => { let v = v0; for (const k of ks) v += k.d * (spring(t - k.t, k.r) + spring(t + T - k.t, k.r)); return v; };
  };
}
// A quick on/off switch (opacity) from a list of [beat, 0|1] flips; starts at `first`.
const flips = (K, first, list, resp = 0.2) => K([[0, first], ...list.map(([b, v]) => [b, v, resp])]);

const rgb = (c) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",")})`;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const f2 = (x) => x.toFixed(2);

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent.appendChild(n);
  return n;
}
// Fade content in/out with a short blur (layers are centred with translate(-50%,-50%) unless `base` says otherwise).
function show(node, o, base = "translate(-50%,-50%)") {
  const a = clamp01(o), s = node.style;
  s.opacity = a.toFixed(3);
  s.visibility = a < 0.004 ? "hidden" : "visible";
  const blur = (1 - a) * 9;
  s.filter = blur > 0.2 && a > 0.004 ? `blur(${f2(blur)}px)` : "none";
  s.transform = `${base} scale(${(0.97 + 0.03 * a).toFixed(4)})`;
}
function box(node, w, h, r, bg, press = 1, cx = 540, cy = 540) {
  const s = node.style;
  s.width = `${f2(w)}px`; s.height = `${f2(h)}px`;
  s.borderRadius = `${f2(Math.max(0, r))}px`;
  if (bg) s.background = rgb(bg);
  s.transform = `translate(${f2(cx - w / 2)}px,${f2(cy - h / 2)}px) scale(${press.toFixed(4)})`;
}
const CHECK = '<svg class="fl-check" viewBox="0 0 40 40" aria-hidden="true"><path d="M11 21l6 6 12-14" pathLength="100"/></svg>';

// The measuring panel: card image with its four inner-border lines (design units, panel-local).
const PANEL = { w: 560, h: 800 };
const CARD = { x: 80, y: 40, w: 400, h: 550 };
function cardLines(card) {
  return { l: (card.l / card.w) * CARD.w, r: (card.r / card.w) * CARD.w, t: (card.t / card.h) * CARD.h, b: (card.b / card.h) * CARD.h };
}
function buildCardPanel(parent, images) {
  const panel = el("div", "fl-layer fl-panel", parent);
  const img = el("img", "fl-card-img", panel);
  Object.assign(img, { src: images.card, alt: "", decoding: "async" });
  const lineBox = el("div", "fl-lines", panel);
  const lines = Object.fromEntries(["l", "r", "t", "b"].map((k) => [k, el("i", `fl-line fl-line-${k}`, lineBox)]));
  return { panel, lines };
}
function placeLines(lines, L, o = [1, 1, 1, 1], slideIn = true) {
  ["l", "r", "t", "b"].forEach((k, i) => {
    const a = clamp01(o[i]), s = lines[k].style;
    s.opacity = a.toFixed(3);
    const slide = slideIn ? (1 - a) * 26 * (k === "l" || k === "t" ? 1 : -1) : 0;
    s.transform = k === "l" || k === "r" ? `translateX(${f2(L[k] + slide)}px)` : `translateY(${f2(L[k] + slide)}px)`;
  });
}

// =====================================================================================================
// Segments. Each returns { seek(t), cam: {z, c}, cur: {p, press} } built from tracks of its own length.
// =====================================================================================================
export const SEGMENTS = {
  // 1. Scan Card -> analyzing -> the card with four lines -> both ratios
  measure: { beats: 12, poster: 7.4, build({ world, K, labels, card, images }) {
    const L = cardLines(card);
    const shape = el("div", "fl-shape", world);
    const btn = el("div", "fl-layer fl-btn", shape, labels.scan);
    const loader = el("div", "fl-layer fl-loader", shape);
    loader.innerHTML = '<svg viewBox="0 0 60 60"><circle class="fl-ring-bg" cx="30" cy="30" r="22"/><circle class="fl-ring" cx="30" cy="30" r="22" pathLength="100"/></svg>';
    const ring = loader.querySelector(".fl-ring");
    const { panel, lines } = buildCardPanel(shape, images);
    const rows = [0, 1].map((i) => {
      const r = el("div", "fl-ro-row", panel);
      r.style.top = `${CARD.y + CARD.h + 58 + i * 66}px`;
      el("span", "fl-ro-k", r, i ? "↕" : "↔");
      return { r, v: el("span", "fl-ro-v", r) };
    });
    const sides = ["l", "r", "t", "b"].map((k) => el("span", `fl-side fl-side-${k}`, panel));
    const vals = { l: card.lr[0], r: card.lr[1], t: card.tb[0], b: card.tb[1] };
    ["l", "r", "t", "b"].forEach((k, i) => { sides[i].textContent = vals[k].toFixed(1); });
    const BTN_W = Math.max(400, Math.ceil(btn.offsetWidth + 128));

    const sW = K([[0, BTN_W], [0.85, 120, 0.36], [3, PANEL.w, 0.5], [9.4, BTN_W, 0.46]]);
    const sH = K([[0, 112], [0.85, 120, 0.36], [3, PANEL.h, 0.5], [9.4, 112, 0.46]]);
    const sR = K([[0, 56], [0.85, 60, 0.36], [3, 40, 0.5], [9.4, 56, 0.46]]);
    const sBg = K([[0, HOVER], [0.8, INK, 0.3], [3, WHITE, 0.3], [9.4, INK, 0.3], [11.4, HOVER, 0.3]]);
    const press = K([[0, 1], [0.5, 0.95, 0.16], [0.75, 1, 0.3]]);
    const oBtn = flips(K, 1, [[0.85, 0], [9.6, 1]]);
    const oLoader = flips(K, 0, [[0.95, 1], [3, 0]]);
    const oPanel = flips(K, 0, [[3.1, 1], [9.4, 0]], 0.26);
    const oLines = [0, 1, 2, 3].map((i) => K([[0, 0], [4 + i * 0.125, 1, 0.3], [9.4, 0, 0.2]]));
    const oRows = [0, 1].map((i) => K([[0, 0], [5 + i * 0.15, 1, 0.24], [9.1, 0, 0.2]]));
    const roll = [K([[0, 50], [5, card.lr[0], 0.55], [9.8, 50, 0.1]]), K([[0, 50], [5.15, card.tb[0], 0.55], [9.8, 50, 0.1]])];
    const oSides = [0, 1, 2, 3].map((i) => K([[0, 0], [6 + i * 0.1, 1, 0.24], [8.9, 0, 0.2]]));
    const camZ = K([[0, 1.75], [0.85, 2.5, 0.5], [3, 1.12, 0.62], [7, 1.2, 0.8], [8.6, 1.12, 0.7], [9.4, 1.75, 0.5]]);
    const camC = K([[0, [540, 540]], [7, [540, 575], 0.8], [8.6, [540, 540], 0.7]]);
    const cur = K([[0, [600, 562]], [1.6, [690, 640], 0.7], [3.4, [880, 720], 0.7], [10, [900, 900], 0.7], [11.1, [600, 562], 0.6]]);
    const curPress = K([[0, 1], [0.5, 0.84, 0.14], [0.75, 1, 0.24]]);

    return { cam: { z: camZ, c: camC }, cur: { p: cur, press: curPress }, seek(t) {
      const b = t / BEAT;
      box(shape, sW(t), sH(t), sR(t), sBg(t), press(t));
      show(btn, oBtn(t));
      show(loader, oLoader(t));
      ring.style.transform = `rotate(${((b * 180) % 360).toFixed(1)}deg)`;
      ring.style.strokeDashoffset = f2(62 - 30 * Math.sin(b * Math.PI));
      show(panel, oPanel(t));
      placeLines(lines, L, oLines.map((f) => f(t)));
      rows.forEach(({ r, v }, i) => {
        const o = clamp01(oRows[i](t));
        r.style.opacity = o.toFixed(3);
        r.style.transform = `translate(-50%,${f2((1 - o) * 10)}px)`;
        const target = i ? card.tb[0] : card.lr[0];
        const x = Math.max(50, Math.min(target, roll[i](t)));      // counters never overshoot the reading
        v.textContent = `${x.toFixed(1)} / ${(100 - x).toFixed(1)}`;
      });
      sides.forEach((s, i) => { const o = clamp01(oSides[i](t)); s.style.opacity = o.toFixed(3); });
    } };
  } },

  // 2. The loupe goes to a line; drag it onto the printed edge; Looks Right; next line
  check: { beats: 12, poster: 3.9, build({ world, K, labels, card, images }) {
    const L = cardLines(card);
    const LOUPE_R = 92, MAG = 4, OFF = 2.6;
    const shape = el("div", "fl-shape", world);
    const { panel, lines } = buildCardPanel(shape, images);
    const step = [1, 2].map((n) => el("p", "fl-step", panel, labels.step.replace("%1$ld", n).replace("%2$ld", 2)));
    const looks = el("div", "fl-looks", panel);
    const looksLabel = el("span", "fl-looks-label", looks, labels.looks);
    looks.insertAdjacentHTML("beforeend", CHECK);
    const looksCheck = looks.querySelector("path");
    const loupe = el("div", "fl-loupe", panel);
    const loupeImg = el("img", "fl-loupe-img", loupe);
    Object.assign(loupeImg, { src: images.loupe, alt: "", decoding: "async" });
    const lv = el("i", "fl-loupe-line fl-loupe-v", loupe), lh = el("i", "fl-loupe-line fl-loupe-h", loupe);
    const LOOKS_W = Math.max(330, Math.ceil(looksLabel.offsetWidth + 96));
    looks.style.width = `${LOOKS_W}px`;

    const P0 = [CARD.x + L.r, CARD.y + CARD.h * 0.42], P1 = [CARD.x + CARD.w * 0.58, CARD.y + L.b];   // loupe centres, panel-local
    const world_ = (p) => [540 - PANEL.w / 2 + p[0], 540 - PANEL.h / 2 + p[1]];
    const oLoupe = K([[0, 0], [0.5, 1, 0.34], [10.8, 0, 0.26]]);
    const lc = K([[0, P0], [6.5, P1, 0.6], [11.3, P0, 0.1]]);
    const which = K([[0, 0], [6.5, 1, 0.3], [11.3, 0, 0.1]]);            // 0 = right (vertical) line, 1 = bottom line
    const off = K([[0, OFF], [2.55, 0, 0.62], [11.3, OFF, 0.1]]);
    const oStep = [K([[0, 1], [6.2, 0, 0.16], [11.1, 1, 0.2]]), K([[0, 0], [6.3, 1, 0.2], [11, 0, 0.16]])];
    const oLabel = K([[0, 1], [5.7, 0, 0.14], [6.6, 1, 0.2], [9.7, 0, 0.14], [10.6, 1, 0.2]]);
    const draw = K([[0, 100], [5.8, 0, 0.35], [6.6, 100, 0.12], [9.8, 0, 0.35], [10.6, 100, 0.12]]);
    const lpress = K([[0, 1], [5.5, 0.94, 0.16], [5.7, 1, 0.3], [9.5, 0.94, 0.16], [9.7, 1, 0.3]]);
    const lineW = K([[0, 3], [10.2, 5, 0.3], [11, 3, 0.4]]);         // all four lines confirmed: a short bolder beat
    const camZ = K([[0, 1.12], [1, 2.3, 0.62], [4.2, 1.12, 0.6], [7, 2.3, 0.62], [8.5, 1.12, 0.6]]);
    const camC = K([[0, [540, 552]], [1, world_(P0), 0.62], [4.2, [540, 552], 0.6], [7, world_(P1), 0.62], [8.5, [540, 552], 0.6]]);
    const grab = world_([P0[0] + OFF * MAG, P0[1] + 58]);
    const looksAt = world_([PANEL.w / 2 + 40, 690 + 42]);
    const cur = K([[0, [880, 760]], [1.8, grab, 0.6], [2.55, [grab[0] - OFF * MAG, grab[1]], 0.62], [4.8, looksAt, 0.55],
      [6.8, [760, 900], 0.7], [8.8, looksAt, 0.6], [10.3, [880, 760], 0.7]]);
    const curPress = K([[0, 1], [2.5, 0.84, 0.14], [3.8, 1, 0.24], [5.5, 0.84, 0.14], [5.7, 1, 0.24], [9.5, 0.84, 0.14], [9.7, 1, 0.24]]);

    return { cam: { z: camZ, c: camC }, cur: { p: cur, press: curPress }, seek(t) {
      box(shape, PANEL.w, PANEL.h, 40, WHITE);
      show(panel, 1);
      placeLines(lines, L, [1, 1, 1, 1], false);
      const lw = lineW(t);
      for (const k of ["l", "r"]) lines[k].style.width = `${f2(lw)}px`;
      for (const k of ["t", "b"]) lines[k].style.height = `${f2(lw)}px`;
      step.forEach((s, i) => { const o = clamp01(oStep[i](t)); s.style.opacity = o.toFixed(3); s.style.filter = o < 0.98 && o > 0.01 ? `blur(${f2((1 - o) * 6)}px)` : "none"; });
      looks.style.transform = `translate(-50%,0) scale(${lpress(t).toFixed(4)})`;
      looksLabel.style.opacity = clamp01(oLabel(t)).toFixed(3);
      looksCheck.style.strokeDashoffset = f2(Math.max(0, draw(t)));
      const lo = clamp01(oLoupe(t)), [cx, cy] = lc(t), w = clamp01(which(t)), d = off(t);
      loupe.style.opacity = lo.toFixed(3);
      loupe.style.visibility = lo < 0.004 ? "hidden" : "visible";
      loupe.style.transform = `translate(${f2(cx - LOUPE_R)}px,${f2(cy - LOUPE_R)}px) scale(${(0.7 + 0.3 * lo).toFixed(4)})`;
      loupeImg.style.transform = `translate(${f2(LOUPE_R - (cx - CARD.x) * MAG)}px,${f2(LOUPE_R - (cy - CARD.y) * MAG)}px)`;
      lv.style.opacity = (1 - w).toFixed(3);
      lv.style.transform = `translateX(${f2(LOUPE_R + (CARD.x + L.r - cx + d) * MAG)}px)`;
      lh.style.opacity = w.toFixed(3);
      lh.style.transform = `translateY(${f2(LOUPE_R + (CARD.y + L.b - cy) * MAG)}px)`;
    } };
  } },

  // 3. Worth Grading?: type the PSA 10 price; profit bars and the verdict appear
  worth: { beats: 16, poster: 8.5, build({ world, K, labels }) {
    const PW = 680, PH = 690;
    const shape = el("div", "fl-shape", world);
    const lay = el("div", "fl-layer fl-worth", shape);
    const title = el("p", "fl-worth-t", lay, labels.worth);
    const fields = [[labels.raw, "$35"], ["PSA 9", "$85"], ["PSA 10", ""]].map(([k, v]) => {
      const r = el("div", "fl-field-row", lay);
      el("span", "fl-field-k", r, k);
      const f = el("span", "fl-field", r);
      return { f, v: el("span", "fl-field-v", f, v), caret: el("i", "fl-caret", f) };
    });
    el("hr", "fl-sep", lay);
    const bars = [["PSA 10", 125.25], ["PSA 9", 16.5]].map(([k, v]) => {
      const r = el("div", "fl-bar-row", lay);
      el("span", "fl-bar-k", r, k);
      const tr = el("span", "fl-bar", r);
      return { fill: el("i", "", tr), val: el("span", "fl-bar-v", r), v };
    });
    const verdict = el("p", "fl-verdict", lay);
    verdict.innerHTML = CHECK;
    el("span", "", verdict, labels.worthIt);
    const vCheck = verdict.querySelector("path");
    if (title.scrollWidth > PW - 96) title.style.fontSize = `${Math.floor((46 * (PW - 96)) / title.scrollWidth)}px`;

    const typed = (b) => (b < 2.5 || b >= 12.8 ? "" : b < 3 ? "$2" : b < 3.5 ? "$21" : "$210");
    const focus = K([[0, 0], [2.1, 1, 0.2], [4.1, 0, 0.3]]);
    const barW = [K([[0, 0], [4.5, 1, 0.55], [12.5, 0, 0.4]]), K([[0, 0], [5, 16.5 / 125.25, 0.55], [12.5, 0, 0.4]])];
    const count = [K([[0, 0], [5, 125.25, 0.6], [12.5, 0, 0.3]]), K([[0, 0], [5.4, 16.5, 0.6], [12.5, 0, 0.3]])];
    const oCount = [flips(K, 0, [[5, 1], [12.3, 0]]), flips(K, 0, [[5.4, 1], [12.3, 0]])];
    const oVerdict = flips(K, 0, [[6.5, 1], [12, 0]], 0.26);
    const vDraw = K([[0, 100], [6.8, 0, 0.4], [12.4, 100, 0.1]]);
    const oTyped = flips(K, 1, [[12.6, 0], [13, 1]], 0.14);
    const camZ = K([[0, 1.3], [8, 1.42, 0.9], [10.5, 1.3, 0.8]]);
    const camC = K([[0, [540, 540]], [8, [540, 620], 0.9], [10.5, [540, 540], 0.8]]);
    const fieldAt = [540 + PW / 2 - 48 - 100, 540 - PH / 2 + 48 + 76 + 2 * 84 + 32];
    const cur = K([[0, [880, 860]], [1.1, fieldAt, 0.6], [4.4, [860, 760], 0.7], [13.4, [900, 900], 0.8], [15, [880, 860], 0.8]]);
    const curPress = K([[0, 1], [2, 0.84, 0.14], [2.2, 1, 0.24]]);

    return { cam: { z: camZ, c: camC }, cur: { p: cur, press: curPress }, seek(t) {
      const b = t / BEAT;
      box(shape, PW, PH, 40, WHITE);
      show(lay, 1);
      const fo = clamp01(focus(t)), f10 = fields[2];
      f10.f.style.boxShadow = `inset 0 0 0 ${f2(3 * fo)}px ${rgb(INK)}`;
      f10.v.textContent = typed(b) || "$";
      f10.v.style.color = typed(b) ? rgb(INK) : rgb(G_MID);
      f10.v.style.opacity = clamp01(oTyped(t)).toFixed(3);
      f10.caret.style.opacity = fo > 0.5 && Math.floor(b * 2) % 2 === 0 ? "1" : "0";
      bars.forEach((bar, i) => {
        bar.fill.style.transform = `scaleX(${Math.max(0, barW[i](t)).toFixed(4)})`;
        bar.val.textContent = `+$${Math.max(0, Math.min(bar.v, count[i](t))).toFixed(2)}`;
        bar.val.style.opacity = clamp01(oCount[i](t)).toFixed(3);
      });
      const ov = clamp01(oVerdict(t));
      verdict.style.opacity = ov.toFixed(3);
      verdict.style.transform = `translateY(${f2((1 - ov) * 10)}px)`;
      vCheck.style.strokeDashoffset = f2(Math.max(0, vDraw(t)));
    } };
  } },

  // 4. Corner & Edge Close-ups: 2 x 2 corners and four edge crops; tap one to look closer
  closeups: { beats: 16, poster: 0.2, build({ world, K, labels, images }) {
    const PW = 640, PH = 900, PAD = 32, G = 12;
    const TILE = (PW - 2 * PAD - G) / 2, EDGE = (PW - 2 * PAD - 3 * G) / 4;
    const shape = el("div", "fl-shape", world);
    const lay = el("div", "fl-layer fl-close", shape);
    el("p", "fl-close-k", lay, labels.corners).style.top = `${PAD}px`;
    const rects = [];
    const top0 = PAD + 50;
    images.tiles.forEach((src, i) => rects.push([PAD + (i % 2) * (TILE + G), top0 + Math.floor(i / 2) * (TILE + G), TILE, TILE, src]));
    const eTop = top0 + 2 * TILE + G + 34;
    el("p", "fl-close-k", lay, labels.edges).style.top = `${eTop}px`;
    images.edges.forEach((src, i) => rects.push([PAD + i * (EDGE + G), eTop + 50, EDGE, EDGE, src]));
    const tiles = rects.map(([x, y, w, h, src]) => {
      const tl = el("div", "fl-tile", lay);
      Object.assign(tl.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      Object.assign(el("img", "", tl), { src, alt: "", decoding: "async" });
      return tl;
    });
    const zoom = el("div", "fl-zoom", lay);
    const full = [PAD, PAD, PW - 2 * PAD, PH - 2 * PAD];
    const A = rects[3], E = rects[4];                                  // bottom-right corner, top edge
    const zr = K([[0, A.slice(0, 4)], [2.5, full, 0.5], [6.5, A.slice(0, 4), 0.45], [7.6, E.slice(0, 4), 0.1], [9, full, 0.5], [12.5, E.slice(0, 4), 0.45], [13.6, A.slice(0, 4), 0.1]]);
    const oZoom = flips(K, 0, [[2.45, 1], [6.9, 0], [8.95, 1], [12.9, 0]], 0.16);
    const dim = K([[0, 0], [2.5, 1, 0.3], [6.5, 0, 0.3], [9, 1, 0.3], [12.5, 0, 0.3]]);
    // two images in the zoom, one per crop; the right one shows (both are already loaded as tiles)
    const zImgs = [A[4], E[4]].map((src) => Object.assign(el("img", "", zoom), { src, alt: "", decoding: "async" }));
    const camZ = K([[0, 1.14], [3, 1.24, 1], [6.5, 1.14, 0.8], [9.5, 1.24, 1], [12.5, 1.14, 0.8]]);
    const camC = K([[0, [540, 540]]]);
    const at = (r) => [540 - PW / 2 + r[0] + r[2] * 0.55, 540 - PH / 2 + r[1] + r[3] * 0.6];
    const cur = K([[0, [900, 880]], [1.2, at(A), 0.6], [4, [760, 700], 0.8], [6, [700, 640], 0.6], [7.2, at(E), 0.6], [10, [760, 700], 0.8], [12, [700, 640], 0.6], [14, [900, 880], 0.8]]);
    const curPress = K([[0, 1], [2.3, 0.84, 0.14], [2.5, 1, 0.24], [6.3, 0.84, 0.14], [6.5, 1, 0.24], [8.8, 0.84, 0.14], [9, 1, 0.24], [12.3, 0.84, 0.14], [12.5, 1, 0.24]]);

    return { cam: { z: camZ, c: camC }, cur: { p: cur, press: curPress }, seek(t) {
      box(shape, PW, PH, 40, WHITE);
      show(lay, 1);
      const [x, y, w, h] = zr(t), o = clamp01(oZoom(t)), dm = clamp01(dim(t));
      const edge = t / BEAT >= 7.5 && t / BEAT < 13.5;
      zImgs[0].style.display = edge ? "none" : "block";
      zImgs[1].style.display = edge ? "block" : "none";
      Object.assign(zoom.style, { left: `${f2(x)}px`, top: `${f2(y)}px`, width: `${f2(w)}px`, height: `${f2(h)}px`, opacity: o.toFixed(3), visibility: o < 0.004 ? "hidden" : "visible" });
      tiles.forEach((tl) => { tl.style.opacity = (1 - 0.85 * dm).toFixed(3); });
    } };
  } },

  // 5. Submission Log: add a submission; Preparing -> Sent -> Returned 4/4
  ledger: { beats: 16, poster: 8.8, build({ world, K, labels }) {
    const PW = 700, PH = 432;
    const shape = el("div", "fl-shape", world);
    const lay = el("div", "fl-layer fl-ledger", shape);
    const head = el("div", "fl-led-head", lay);
    el("p", "fl-led-t", head, labels.ledger);
    const plus = el("span", "fl-plus", head);
    plus.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    const list = el("div", "fl-led-list", lay);
    const row = el("div", "fl-led-row", list);
    const rowIn = el("div", "fl-led-in", row);
    el("span", "fl-led-k", rowIn, "PSA · Value");
    const detail = el("span", "fl-led-d", rowIn, "4");
    detail.insertAdjacentHTML("beforeend", '<svg class="fl-cards" viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="2.5" width="10" height="14" rx="1.6"/><rect x="3" y="4.5" width="10" height="14" rx="1.6"/></svg>');
    const pill = el("span", "fl-pill", rowIn);
    const pillText = [labels.preparing, labels.sent, `${labels.returned} 4/4`].map((s) => el("span", "fl-pill-t", pill, s));
    const old = el("div", "fl-led-row fl-led-old", list);
    const oldIn = el("div", "fl-led-in", old);
    el("span", "fl-led-k", oldIn, "BGS · Standard");
    el("span", "fl-led-d", oldIn, "2").insertAdjacentHTML("beforeend", '<svg class="fl-cards" viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="2.5" width="10" height="14" rx="1.6"/><rect x="3" y="4.5" width="10" height="14" rx="1.6"/></svg>');
    el("span", "fl-pill fl-pill-static", oldIn, `${labels.returned} 2/2`);
    const pw = pillText.map((p) => Math.ceil(p.offsetWidth + 48));

    const rowH = K([[0, 0], [2, 128, 0.45], [12.5, 0, 0.45]]);
    const oRow = flips(K, 0, [[2.1, 1], [12.3, 0]], 0.26);
    const st = K([[0, 0], [4.6, 1, 0.3], [7.6, 2, 0.3], [13, 0, 0.1]]);
    const pillW = K([[0, pw[0]], [4.6, pw[1], 0.4], [7.6, pw[2], 0.4], [13, pw[0], 0.1]]);
    const pillBg = K([[0, G_FIELD], [4.6, INK, 0.3], [7.6, WHITE, 0.3], [13, G_FIELD, 0.1]]);
    const pillFg = K([[0, INK], [4.6, WHITE, 0.3], [7.6, INK, 0.3], [13, INK, 0.1]]);
    const pillRing = K([[0, 0], [7.6, 3, 0.3], [13, 0, 0.1]]);
    const pPress = K([[0, 1], [1.5, 0.9, 0.16], [1.7, 1, 0.3]]);
    const rPress = K([[0, 1], [4.4, 0.95, 0.16], [4.6, 1, 0.3], [7.4, 0.95, 0.16], [7.6, 1, 0.3]]);
    const camZ = K([[0, 1.36], [9.5, 1.52, 0.9], [11.5, 1.36, 0.8]]);
    const camC = K([[0, [540, 540]], [9.5, [575, 510], 0.9], [11.5, [540, 540], 0.8]]);
    const plusAt = [540 + PW / 2 - 48 - 30, 540 - PH / 2 + 48 + 28];
    const pillAt = [540 + PW / 2 - 48 - 90, 540 - PH / 2 + 48 + 80 + 64];
    const cur = K([[0, [880, 800]], [0.6, plusAt, 0.6], [2.8, pillAt, 0.6], [5.5, [pillAt[0] + 20, pillAt[1] + 70], 0.6], [6.6, pillAt, 0.6], [8.6, [860, 760], 0.8], [14, [880, 800], 0.8]]);
    const curPress = K([[0, 1], [1.5, 0.84, 0.14], [1.7, 1, 0.24], [4.4, 0.84, 0.14], [4.6, 1, 0.24], [7.4, 0.84, 0.14], [7.6, 1, 0.24]]);

    return { cam: { z: camZ, c: camC }, cur: { p: cur, press: curPress }, seek(t) {
      box(shape, PW, PH, 40, WHITE);
      show(lay, 1);
      plus.style.transform = `scale(${pPress(t).toFixed(4)})`;
      const h = Math.max(0, rowH(t)), o = clamp01(oRow(t));
      row.style.height = `${f2(h)}px`;
      rowIn.style.opacity = o.toFixed(3);
      rowIn.style.filter = o > 0.01 && o < 0.98 ? `blur(${f2((1 - o) * 8)}px)` : "none";
      rowIn.style.transform = `scale(${rPress(t).toFixed(4)})`;
      const s = st(t);
      pill.style.width = `${f2(pillW(t))}px`;
      pill.style.background = rgb(pillBg(t));
      pill.style.color = rgb(pillFg(t));
      pill.style.boxShadow = `inset 0 0 0 ${f2(Math.max(0, pillRing(t)))}px ${rgb(INK)}`;
      pillText.forEach((p, i) => {
        const a = clamp01(1 - Math.abs(s - i) * 1.6);
        p.style.opacity = a.toFixed(3);
        p.style.filter = a > 0.01 && a < 0.98 ? `blur(${f2((1 - a) * 6)}px)` : "none";
      });
    } };
  } },

  // 6. Share Studio: switch the layout and turn the measuring lines off and on
  share: { beats: 16, poster: 3.6, build({ world, K, labels, card, images }) {
    const L = cardLines(card);
    const PW = 640, PH = 880;
    const shape = el("div", "fl-shape", world);
    const lay = el("div", "fl-layer fl-share", shape);
    el("p", "fl-share-t", lay, labels.share);
    const seg = el("div", "fl-segs", lay);
    const knob = el("i", "fl-seg-knob", seg);
    const icons = [[26, 32], [30, 30], [20, 36]].map(([w, h]) => {
      const s = el("span", "fl-seg", seg);
      s.innerHTML = `<i style="width:${w}px;height:${h}px"></i>`;
      return s;
    });
    const stageBox = el("div", "fl-preview", lay);
    const frame = el("div", "fl-frame", stageBox);
    const pic = el("div", "fl-pic", frame);
    const img = el("img", "", pic);
    Object.assign(img, { src: images.card, alt: "", decoding: "async" });
    const lineBox = el("div", "fl-lines fl-lines-share", pic);
    const lines = Object.fromEntries(["l", "r", "t", "b"].map((k) => [k, el("i", `fl-line fl-line-${k}`, lineBox)]));
    const toggle = el("div", "fl-toggle", lay);
    el("span", "fl-toggle-k", toggle, labels.lines);
    const sw = el("span", "fl-switch", toggle);
    const swKnob = el("i", "", sw);

    // frame sizes (preview area is 520 x 520): listing 4:5, square 1:1, story 9:16
    const FR = { listing: [400, 500], square: [480, 480], story: [288, 512] };
    const fw = K([[0, FR.listing[0]], [2.1, FR.square[0], 0.45], [5.1, FR.story[0], 0.45], [12.6, FR.listing[0], 0.45]]);
    const fh = K([[0, FR.listing[1]], [2.1, FR.square[1], 0.45], [5.1, FR.story[1], 0.45], [12.6, FR.listing[1], 0.45]]);
    const kx = K([[0, 0], [2.1, 1, 0.35], [5.1, 2, 0.35], [12.6, 0, 0.35]]);
    const on = K([[0, 1], [8.1, 0, 0.3], [10.1, 1, 0.3]]);
    const camZ = K([[0, 1.14], [6, 1.22, 1], [9, 1.14, 0.9]]);
    const camC = K([[0, [540, 540]]]);
    const segAt = (i) => [540 - 132 + 88 * i + 44, 540 - PH / 2 + 40 + 64 + 36];
    const swAt = [540 + PW / 2 - 40 - 50, 540 + PH / 2 - 40 - 40];
    const cur = K([[0, [880, 860]], [1.1, segAt(1), 0.6], [4.1, segAt(2), 0.6], [7.1, swAt, 0.6], [11.5, segAt(0), 0.6], [13.6, [880, 860], 0.8]]);
    const curPress = K([[0, 1], [1.9, 0.84, 0.14], [2.1, 1, 0.24], [4.9, 0.84, 0.14], [5.1, 1, 0.24], [7.9, 0.84, 0.14], [8.1, 1, 0.24],
      [9.9, 0.84, 0.14], [10.1, 1, 0.24], [12.4, 0.84, 0.14], [12.6, 1, 0.24]]);

    return { cam: { z: camZ, c: camC }, cur: { p: cur, press: curPress }, seek(t) {
      box(shape, PW, PH, 40, WHITE);
      show(lay, 1);
      const w = fw(t), h = fh(t), k = kx(t), o = clamp01(on(t));
      Object.assign(frame.style, { width: `${f2(w)}px`, height: `${f2(h)}px` });
      // the card sits in the frame with a margin, as large as fits
      const s = Math.min((w - 56) / CARD.w, (h - 56) / CARD.h);
      Object.assign(pic.style, { width: `${f2(CARD.w * s)}px`, height: `${f2(CARD.h * s)}px` });
      ["l", "r", "t", "b"].forEach((key) => {
        const st = lines[key].style;
        st.opacity = o.toFixed(3);
        st.transform = key === "l" || key === "r" ? `translateX(${f2(L[key] * s)}px)` : `translateY(${f2(L[key] * s)}px)`;
        if (key === "l" || key === "r") { st.height = `${f2(CARD.h * s + 40)}px`; st.top = "-20px"; }
        else { st.width = `${f2(CARD.w * s + 40)}px`; st.left = "-20px"; }
      });
      knob.style.transform = `translateX(${f2(k * 88)}px)`;
      icons.forEach((ic, i) => { ic.style.color = rgb(Math.abs(k - i) < 0.5 ? WHITE : INK); });
      swKnob.style.transform = `translateX(${f2(o * 36)}px)`;
      sw.style.background = rgb(INK.map((c, i) => c + (G_TRACK[i] - 20 - c) * (1 - o)));
    } };
  } },
};

// =====================================================================================================
export async function mount(root, { segment, labels, card, images, still = false }) {
  const seg = SEGMENTS[segment];
  const T = seg.beats * BEAT;
  const K = tracks(T);
  root.textContent = "";
  const stage = el("div", "fl-stage", root);
  const world = el("div", "fl-world", stage);
  const cursor = el("div", "fl-cursor", stage);
  cursor.innerHTML = '<svg viewBox="0 0 28 34" aria-hidden="true"><path d="M3 2.5v24.2l6.1-5.6 3.9 9.3 4.6-2-3.9-9.1 8.5-.5z"/></svg>';
  // Load the web font for these strings before measuring labels (fonts.ready can resolve before a load starts).
  const text = Object.values(labels).join("");
  await Promise.all(["640 40px Archivo", "720 42px Archivo", "760 46px Archivo"].map((f) => document.fonts.load(f, text).catch(() => {})));
  const api = seg.build({ world, K, labels, card, images });

  let scale = 1;
  const seek = (tSec) => {
    const t = ((tSec % T) + T) % T;
    const z = api.cam.z(t), [cx, cy] = api.cam.c(t);
    world.style.transform = `translate(${f2((W / 2) * scale)}px,${f2((W / 2) * scale)}px) scale(${(z * scale).toFixed(5)}) translate(${f2(-cx)}px,${f2(-cy)}px)`;
    api.seek(t);
    const [wx, wy] = api.cur.p(t);
    cursor.style.transform = `translate(${f2(((wx - cx) * z + W / 2) * scale)}px,${f2(((wy - cy) * z + W / 2) * scale)}px) scale(${(scale * api.cur.press(t)).toFixed(4)})`;
  };
  const resize = () => { scale = stage.getBoundingClientRect().width / W || 1; };
  resize();

  // requestAnimationFrame while on screen; paused off screen or in a hidden tab
  let clock = seg.poster * BEAT, last = 0, raf = 0, visible = false;
  const frame = (now) => {
    raf = 0;
    if (!visible || document.hidden) { last = 0; return; }
    if (last) clock = (clock + Math.min(0.1, (now - last) / 1000)) % T;
    last = now;
    seek(clock);
    raf = requestAnimationFrame(frame);
  };
  const play = () => { if (!raf && !still) raf = requestAnimationFrame(frame); };
  seek(clock);
  if (!still) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) play(); }, { threshold: 0.35 }).observe(stage);
    document.addEventListener("visibilitychange", play);
  }
  new ResizeObserver(() => { resize(); seek(clock); }).observe(stage);
  root.classList.add("is-live");
  return { seek(s) { clock = s; seek(s); }, duration: T, poster: seg.poster * BEAT };
}
