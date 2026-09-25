// Desktop hero: the sample card on a lightbox, measured as the visitor scrolls.
// Loaded only on wide screens with a fine pointer, WebGL 2 and no reduced-motion preference (see home.js).
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

// Card geometry in card-local units: width 1, height A. Pixel values come from the measured scan of the
// real sample card (panel[data-card], written by tools/build.py from tools/src/art/real/charizard-measure.json).
let TEX_W = 1, TEX_H = 1, A = 1, INNER = null, CLOSE = [];
const px = x => x / TEX_W - 0.5;
const py = y => (0.5 - y / TEX_H) * A;
function readCard(panel) {
  const c = JSON.parse(panel.dataset.card);
  TEX_W = c.w; TEX_H = c.h; A = TEX_H / TEX_W;
  INNER = { l: px(c.l), r: px(c.r), t: py(c.t), b: py(c.b) }; // inner edges of the printed border
  CLOSE = c.close; // close-up regions [x, y, w, h] in texture pixels
}

const INK = new THREE.Color(0x14161a), CYAN = new THREE.Color(0x00a0dc), MAGENTA = new THREE.Color(0xd6247b), YELLOW = new THREE.Color(0xf2c200), WHITE = new THREE.Color(0xffffff);

export async function start({ panel, onStep }) {
  const canvas = panel.querySelector("canvas[data-gl]");
  const labelBox = panel.querySelector("[data-gl-labels]");
  const labels = Object.fromEntries([...labelBox.querySelectorAll("[data-lbl]")].map(el => [el.dataset.lbl, el]));
  // The fallback <img> is lazy, so resolve its src attribute rather than currentSrc (may still be empty).
  readCard(panel);
  const cardUrl = new URL(panel.querySelector("[data-stage-fig] img").getAttribute("src"), location.href).href.replace("sample-card-640", "sample-card");

  // Pass sRGB values straight through so canvas colours match the CSS colours exactly.
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  // Lightbox glow, drawn as a full-screen quad (matches the .panel CSS gradient used before WebGL is ready).
  const bgMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, uniforms: { uAspect: { value: 1 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }",
    fragmentShader: `varying vec2 vUv; uniform float uAspect;
      void main(){
        vec2 p = vUv - vec2(0.5, 0.54); p.x *= uAspect;
        float d = length(p * vec2(1.0, 1.1));
        vec3 col = mix(vec3(1.0), vec3(0.980, 0.984, 0.988), smoothstep(0.0, 0.42, d));
        col = mix(col, vec3(0.961, 0.969, 0.976), smoothstep(0.42, 0.95, d));
        float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor = vec4(col + (n - 0.5) / 255.0, 1.0);
      }`,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg);

  const tex = await new THREE.TextureLoader().loadAsync(cardUrl);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // ---- the card: rounded-corner mask, moving sheen and the loupe, all in one fragment shader
  const cardMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uMap: { value: tex }, uAspect: { value: 1 / A }, uRadius: { value: 3.18 / 63 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uLoupe: { value: 0 }, uLensR: { value: 0.13 }, uZoom: { value: 2.6 },
      uSheen: { value: 0 }, uSheenAmt: { value: 0.1 }, uRim: { value: 0.003 },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `precision highp float;
      uniform sampler2D uMap; uniform float uAspect, uRadius, uLoupe, uLensR, uZoom, uSheen, uSheenAmt, uRim; uniform vec2 uMouse;
      varying vec2 vUv;
      float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){
        vec2 S = vec2(1.0, 1.0 / uAspect);
        vec2 p = (vUv - 0.5) * S;
        float d = sdRound(p, S * 0.5, uRadius);
        float aa = fwidth(d);
        float alpha = 1.0 - smoothstep(-aa, aa, d);
        if (alpha <= 0.0) discard;
        vec2 m = (uMouse - 0.5) * S;
        vec2 dm = p - m; float r = length(dm); float k = r / uLensR;
        float lens = (1.0 - smoothstep(uLensR - aa, uLensR, r)) * uLoupe;
        float zoom = uZoom * (1.0 - 0.10 * k * k);               // a touch of barrel, like glass
        vec2 uvz = (m + dm / zoom) / S + 0.5;
        float fr = smoothstep(0.6, 1.0, k) * 0.0045;             // CMY fringe at the rim: mis-registration
        vec3 zc = vec3(texture2D(uMap, uvz + dm * fr).r, texture2D(uMap, uvz).g, texture2D(uMap, uvz - dm * fr).b);
        vec3 col = mix(texture2D(uMap, vUv).rgb, zc, lens);
        col *= 1.0 - lens * smoothstep(0.78, 1.0, k) * 0.10;
        float rim = smoothstep(uLensR - uRim * 1.6, uLensR - uRim * 0.4, r) * (1.0 - smoothstep(uLensR, uLensR + aa, r));
        float arm = uLensR * 0.34;
        float cx = (1.0 - smoothstep(uRim * 0.25, uRim * 0.55, abs(dm.x))) * step(abs(dm.y), arm);
        float cy = (1.0 - smoothstep(uRim * 0.25, uRim * 0.55, abs(dm.y))) * step(abs(dm.x), arm);
        float cross = max(cx, cy) * smoothstep(uLensR * 0.07, uLensR * 0.1, r);
        col = mix(col, vec3(0.078, 0.086, 0.102), clamp(rim + cross, 0.0, 1.0) * uLoupe);
        float sheen = smoothstep(0.32, 0.0, abs(p.x * 0.8 + p.y * 0.6 - uSheen)) * uSheenAmt;
        gl_FragColor = vec4(col + sheen, alpha);
      }`,
  });
  const cardGroup = new THREE.Group();
  scene.add(cardGroup);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, A), cardMat);
  cardGroup.add(card);

  // ---- soft shadow on the lightbox (world space, follows the card)
  const shadowTex = makeShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, color: INK, transparent: true, depthWrite: false, opacity: 0.3 });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.36, A * 1.26), shadowMat);
  shadow.renderOrder = -5; scene.add(shadow);

  // ---- overlays (children of the card so they tilt with it)
  const overlay = new THREE.Group();
  overlay.position.z = 0.002;
  cardGroup.add(overlay);
  const flat = (color, order, opacity = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false }));
    m.renderOrder = order; overlay.add(m); return m;
  };

  // Measurement lines: they overshoot slightly past the card like guides on a proof.
  const lines = {
    l: flat(CYAN, 4), r: flat(CYAN, 4), t: flat(CYAN, 4), b: flat(CYAN, 4),
  };
  const ext = 0.1;
  // Dimension ticks between the outer edge and the inner line.
  const dims = { l: flat(INK, 5), r: flat(INK, 5), t: flat(INK, 5), b: flat(INK, 5) };
  // Trim marks at the four outer corners.
  const trims = [];
  for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    trims.push({ h: flat(INK, 5), v: flat(INK, 5), sx, sy });
  }
  // Close-up regions (4 corners, 4 edge midpoints), outlined.
  const closeRegions = [];
  for (const [cx, cy, cw, ch] of CLOSE) {
    const x = px(cx + cw / 2), y = py(cy + ch / 2);
    closeRegions.push({ x, y, w: cw / TEX_W, h: ch / TEX_W, edges: [flat(CYAN, 4), flat(CYAN, 4), flat(CYAN, 4), flat(CYAN, 4)] });
  }
  // Registration marks: three layers (C, M, Y) per inner corner, multiplied so a perfect fit prints black.
  const regCorners = [[INNER.l, INNER.t], [INNER.r, INNER.t], [INNER.l, INNER.b], [INNER.r, INNER.b]];
  const regLayers = [];
  const regGroup = new THREE.Group();
  overlay.add(regGroup);
  regCorners.forEach(([x, y], ci) => {
    [CYAN, MAGENTA, YELLOW].forEach((color, li) => {
      const mat = new THREE.MeshBasicMaterial({ color: WHITE.clone(), blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthTest: false, depthWrite: false });
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.029, 0.032, 64), mat);
      const armH = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      const armV = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      [ring, armH, armV].forEach(m => { m.renderOrder = 6; g.add(m); });
      regGroup.add(g);
      const dir = new THREE.Vector2(Math.sign(x), Math.sign(y)).normalize();
      const perp = new THREE.Vector2(-dir.y, dir.x);
      const from = new THREE.Vector2(x, y).add(dir.clone().multiplyScalar(0.95 + li * 0.18)).add(perp.multiplyScalar((li - 1) * 0.28));
      regLayers.push({ g, ring, armH, armV, mat, color, home: new THREE.Vector2(x, y), from, spin: (li - 1) * 1.4 + ci * 0.3 });
    });
  });

  // ---- state driven by scroll (tweened proxies, read every frame)
  const S = { flat: 0, marks: 0, lines: 0, close: 0, dimLines: 1, loupeAuto: 0 };
  const lineOffset = { l: -0.06, r: 0.06, t: 0.06, b: -0.06 };
  const lineSnap = { l: 0, r: 0, t: 0, b: 0 };

  // ---- sizing
  let W = 1, H = 1, pxPerUnit = 1, cardScale = 1, cardY = 0;
  const lineW = cssPx => cssPx / pxPerUnit;
  function resize() {
    const rect = panel.getBoundingClientRect();
    W = Math.max(1, rect.width); H = Math.max(1, rect.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    bgMat.uniforms.uAspect.value = W / H;
    const visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visW = visH * camera.aspect;
    cardScale = Math.min((visH * 0.5) / A, visW * 0.44);
    cardY = visH * 0.085;
    pxPerUnit = (H / visH) * cardScale;
    cardGroup.scale.setScalar(cardScale);
    shadow.scale.setScalar(cardScale);
    cardMat.uniforms.uRim.value = lineW(1.6);
    layoutOverlays();
  }
  function layoutOverlays() {
    const t = lineW(1.5), thin = lineW(1.1);
    lines.l.scale.set(t, A + ext * 2, 1); lines.r.scale.set(t, A + ext * 2, 1);
    lines.t.scale.set(1 + ext * 2, t, 1); lines.b.scale.set(1 + ext * 2, t, 1);
    dims.l.scale.set(INNER.l + 0.5, thin, 1); dims.l.position.set((INNER.l - 0.5) / 2, 0.06, 0);
    dims.r.scale.set(0.5 - INNER.r, thin, 1); dims.r.position.set((INNER.r + 0.5) / 2, 0.06, 0);
    dims.t.scale.set(thin, A / 2 - INNER.t, 1); dims.t.position.set(0.06, (INNER.t + A / 2) / 2, 0);
    dims.b.scale.set(thin, INNER.b + A / 2, 1); dims.b.position.set(0.06, (INNER.b - A / 2) / 2, 0);
    const off = 0.03, len = 0.07;
    for (const tr of trims) {
      tr.h.scale.set(len, thin, 1); tr.h.position.set(tr.sx * (0.5 + off + len / 2), tr.sy * A / 2, 0);
      tr.v.scale.set(thin, len, 1); tr.v.position.set(tr.sx * 0.5, tr.sy * (A / 2 + off + len / 2), 0);
    }
    for (const reg of regLayers) {
      const r = 0.03, w = lineW(1.8);
      reg.ring.geometry.dispose();
      reg.ring.geometry = new THREE.RingGeometry(r - w / 2, r + w / 2, 72);
      reg.armH.scale.set(0.1, w, 1); reg.armV.scale.set(w, 0.1, 1);
    }
    for (const c of closeRegions) {
      const [e0, e1, e2, e3] = c.edges, hw = c.w / 2, hh = c.h / 2;
      e0.scale.set(c.w, thin, 1); e0.position.set(c.x, c.y + hh, 0);
      e1.scale.set(c.w, thin, 1); e1.position.set(c.x, c.y - hh, 0);
      e2.scale.set(thin, c.h, 1); e2.position.set(c.x - hw, c.y, 0);
      e3.scale.set(thin, c.h, 1); e3.position.set(c.x + hw, c.y, 0);
    }
  }
  new ResizeObserver(resize).observe(panel);
  resize();

  // ---- pointer: tilt + loupe
  const pointer = new THREE.Vector2(0, 0), pointerN = new THREE.Vector2(9, 9);
  const raycaster = new THREE.Raycaster();
  const lens = { on: 0, target: new THREE.Vector2(0.5, 0.5) };
  let hovering = false;
  panel.addEventListener("pointermove", e => {
    const r = panel.getBoundingClientRect();
    pointer.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
    pointerN.copy(pointer);
  });
  panel.addEventListener("pointerleave", () => { pointerN.set(9, 9); pointer.set(0, 0); });

  // ---- scroll: Lenis for smooth wheel, ScrollTrigger for the story
  const lenis = new Lenis({ lerp: 0.12, anchors: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  const hero = document.querySelector(".hero");
  gsap.to(S, { flat: 1, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom 35%", scrub: 0.8 } });

  let step = -1, stepTl = null, demo = null;
  function setStep(n) {
    if (n === step) return;
    step = n;
    onStep(n);
    labelBox.classList.toggle("on", n >= 3);
    stepTl?.kill();
    demo?.kill(); demo = null;
    stepTl = gsap.timeline({ defaults: { overwrite: "auto" } });
    if (n >= 2) {
      stepTl.to(S, { marks: 1, duration: 1.3, ease: "expo.out" }, 0);
      if (S.lines < 1) {
        for (const k of ["l", "t", "r", "b"]) lineSnap[k] = 0;
        stepTl.to(S, { lines: 1, duration: 0.25, ease: "power2.out" }, 0.45);
        ["l", "t", "r", "b"].forEach((k, i) => stepTl.to(lineSnap, { [k]: 1, duration: 0.55, ease: "back.out(3)" }, 0.5 + i * 0.09));
      }
    } else {
      stepTl.to(S, { marks: 0, lines: 0, duration: 0.5, ease: "power2.inOut" }, 0);
    }
    stepTl.to(S, { close: n >= 5 ? 1 : 0, dimLines: n >= 5 ? 0.35 : 1, duration: 0.6, ease: "power2.out" }, 0);
    if (n === 3) {
      // The app's guided line check: the loupe visits each line in turn.
      const stops = [[INNER.l, 0.18], [0.12, INNER.t], [INNER.r, -0.22], [-0.1, INNER.b]].map(([x, y]) => new THREE.Vector2(x + 0.5, y / A + 0.5));
      demo = gsap.timeline({ delay: 0.5 });
      demo.to(S, { loupeAuto: 1, duration: 0.35 }, 0);
      lens.target.copy(stops[0]);
      stops.forEach((s, i) => demo.to(lens.target, { x: s.x, y: s.y, duration: 0.55, ease: "power3.inOut" }, i === 0 ? 0 : i * 1.05));
      demo.to(S, { loupeAuto: 0, duration: 0.4 }, stops.length * 1.05 + 0.3);
    } else {
      stepTl.to(S, { loupeAuto: 0, duration: 0.3 }, 0);
    }
  }
  const steps = [...document.querySelectorAll(".step")];
  steps.forEach(el => {
    const n = Number(el.dataset.step);
    ScrollTrigger.create({
      trigger: el, start: "top 55%", end: "bottom 55%",
      onEnter: () => setStep(n), onEnterBack: () => setStep(n),
      onLeaveBack: () => { if (n === 1) setStep(0); },
    });
  });
  setStep(0);

  // ---- frame loop (paused while the stage is off screen or the tab is hidden)
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(panel);
  const clock = new THREE.Clock();
  const v3 = new THREE.Vector3();
  let first = true;

  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const t = clock.getElapsedTime();
    const f = S.flat;
    const idle = 1 - f;

    // Card pose: tilted and lifted in the hero, flat on the lightbox once measuring starts.
    const tilt = 0.14 * idle + 0.02;
    cardGroup.rotation.x = THREE.MathUtils.lerp(-0.58, 0, f) + Math.sin(t * 0.7) * 0.025 * idle - pointer.y * tilt;
    cardGroup.rotation.y = THREE.MathUtils.lerp(0.46, 0, f) + Math.cos(t * 0.55) * 0.03 * idle + pointer.x * tilt;
    cardGroup.rotation.z = THREE.MathUtils.lerp(-0.11, 0, f);
    cardGroup.position.set(0, cardY + Math.sin(t * 0.9) * 0.04 * idle, THREE.MathUtils.lerp(1.1, 0, f));
    cardMat.uniforms.uSheen.value = cardGroup.rotation.y * 1.2 - cardGroup.rotation.x * 0.8;
    cardMat.uniforms.uSheenAmt.value = 0.05 + 0.08 * idle;
    shadow.position.set(THREE.MathUtils.lerp(0.35, 0, f) * cardScale, cardY + THREE.MathUtils.lerp(-0.55, -0.03, f) * cardScale, 0);
    shadow.scale.setScalar(cardScale * THREE.MathUtils.lerp(1.12, 0.84, f));
    shadowMat.opacity = THREE.MathUtils.lerp(0.16, 0.34, f);

    // Loupe: the visitor's pointer wins over the automatic line check.
    cardGroup.updateMatrixWorld();
    let wantLens = S.loupeAuto;
    if (pointerN.x < 5) {
      raycaster.setFromCamera(pointerN, camera);
      const hit = raycaster.intersectObject(card)[0];
      hovering = !!hit;
      if (hit) { lens.target.copy(hit.uv); wantLens = 1; }
    } else hovering = false;
    canvas.style.cursor = hovering ? "none" : "";
    lens.on += (wantLens - lens.on) * 0.14;
    cardMat.uniforms.uLoupe.value = lens.on;
    cardMat.uniforms.uMouse.value.lerp(lens.target, hovering ? 0.35 : 0.2);

    // Overlays.
    const lv = S.lines * S.dimLines;
    for (const k of ["l", "r", "t", "b"]) {
      const m = lines[k]; const snap = lineSnap[k];
      const target = INNER[k];
      const pos = target + lineOffset[k] * (1 - snap);
      if (k === "l" || k === "r") m.position.set(pos, 0, 0); else m.position.set(0, pos, 0);
      m.material.opacity = lv;
    }
    const lab = step >= 3 ? 1 : 0;
    for (const k of ["l", "r", "t", "b"]) dims[k].material.opacity = lab * S.dimLines;
    for (const tr of trims) { tr.h.material.opacity = S.marks; tr.v.material.opacity = S.marks; }
    for (const c of closeRegions) for (const e of c.edges) e.material.opacity = S.close;
    regLayers.forEach((reg, i) => {
      const local = THREE.MathUtils.clamp(S.marks * 1.25 - (i % 3) * 0.09 - Math.floor(i / 3) * 0.03, 0, 1);
      const e = 1 - Math.pow(1 - local, 3);
      reg.g.position.set(THREE.MathUtils.lerp(reg.from.x, reg.home.x, e), THREE.MathUtils.lerp(reg.from.y, reg.home.y, e), 0);
      reg.g.rotation.z = reg.spin * (1 - e);
      reg.mat.color.copy(WHITE).lerp(reg.color, Math.min(1, local * 3));
      reg.g.visible = local > 0;
    });

    // DOM labels next to each border.
    if (step >= 3) {
      placeLabel(labels.l, -0.5 - 0.035, 0.06, "r");
      placeLabel(labels.r, 0.5 + 0.035, 0.06, "l");
      placeLabel(labels.t, 0.06, A / 2 + 0.05, "c");
      placeLabel(labels.b, 0.06, -A / 2 - 0.05, "c");
    }

    renderer.render(scene, camera);
    if (first) { first = false; panel.classList.add("gl-on"); }
  }
  function placeLabel(el, x, y, align) {
    v3.set(x, y, 0).applyMatrix4(overlay.matrixWorld).project(camera);
    const sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
    const tx = align === "r" ? "-100%" : align === "c" ? "-50%" : "0";
    el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(${tx}, -50%)`;
  }
  frame();
}

function makeShadowTexture() {
  // A blurred rounded rectangle; its alpha shapes the shadow, the material colour is the ink.
  const c = document.createElement("canvas");
  c.width = 256; c.height = 320;
  const g = c.getContext("2d");
  g.filter = "blur(18px)";
  g.fillStyle = "#fff";
  g.beginPath();
  g.roundRect(48, 48, 160, 224, 10);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
