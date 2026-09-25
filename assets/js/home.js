// Home page behaviour. Heavy things (Three.js, GSAP, Lenis) are only imported on capable desktops.
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const desktop = matchMedia("(min-width: 1100px)");

setupVideos();
setupDock();
setupOdometers();
setupStage();
setupFlow();

// Muted loop videos: play only while on screen; with reduced motion show the poster and native controls.
function setupVideos() {
  const videos = [...document.querySelectorAll("video[data-video]")];
  if (reduceMotion) {
    videos.forEach(video => { video.controls = true; });
    return;
  }
  const io = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting && target.offsetParent !== null) {
        target.preload = "auto";
        target.play().catch(() => { target.controls = true; });
      } else if (!target.paused) {
        target.pause();
      }
    }
  }, { threshold: 0.25 });
  videos.forEach(video => io.observe(video));
}

// Phone-only App Store bar: shown after the hero badge scrolls away, hidden again at the footer.
function setupDock() {
  const dock = document.querySelector("[data-dock]");
  const get = document.querySelector("[data-hero-get]");
  const footer = document.querySelector("footer");
  if (!dock || !get || !footer) return;
  let heroVisible = true, footerVisible = false;
  const update = () => dock.classList.toggle("is-on", !heroVisible && !footerVisible);
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting || e.boundingClientRect.top > 0; update(); }).observe(get);
  new IntersectionObserver(([e]) => { footerVisible = e.isIntersecting; update(); }).observe(footer);
}

// Readout digits roll like a mechanical counter: every digit is a 0–9 strip.
function setupOdometers() {
  for (const el of document.querySelectorAll("[data-odo]")) {
    const text = el.dataset.odo;
    el.textContent = "";
    el.setAttribute("aria-label", text);
    const box = document.createElement("span");
    box.className = "odo";
    for (const ch of text) {
      const cell = document.createElement("i");
      if (/\d/.test(ch)) {
        const strip = document.createElement("span");
        strip.className = "d";
        strip.dataset.target = ch;
        strip.innerHTML = "0123456789".split("").map(n => `<span>${n}</span>`).join("");
        cell.appendChild(strip);
      } else {
        cell.textContent = ch;
        cell.className = "sep";
      }
      box.appendChild(cell);
    }
    el.appendChild(box);
  }
}

// Shared by the WebGL stage and the image fallback: which readout rows are live for a step.
function applyReadout(step) {
  const rows = { lr: step >= 3, tb: step >= 3, ref: step >= 4 };
  document.querySelector("[data-readout]")?.setAttribute("data-level", step >= 3 ? "on" : step >= 2 ? "dim" : "off");
  for (const [key, live] of Object.entries(rows)) {
    const row = document.querySelector(`[data-ro-row="${key}"]`);
    if (!row) continue;
    row.classList.toggle("on", live);
    for (const strip of row.querySelectorAll(".d")) {
      const digit = live ? Number(strip.dataset.target) : 0;
      strip.style.transform = `translateY(${-digit * 1.1}em)`;
    }
  }
  document.querySelector(".ro-gauge")?.classList.toggle("on", step >= 4);
}

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!canvas.getContext("webgl2"); // three r170 needs WebGL 2
  } catch { return false; }
}

function capableOf3D() {
  const conn = navigator.connection;
  return desktop.matches && matchMedia("(pointer: fine)").matches && !reduceMotion && webglAvailable()
    && (navigator.hardwareConcurrency || 4) >= 4 && (navigator.deviceMemory || 8) >= 4 && !(conn && conn.saveData);
}

function setupStage() {
  const panel = document.querySelector("[data-panel]");
  if (!panel) return;
  if (reduceMotion) {
    document.querySelector("[data-stage-fig]").dataset.state = "4";
    applyReadout(4);
    return;
  }
  if (!desktop.matches) return; // phones and tablets use the per-step figures instead of the stage
  applyReadout(0);
  if (capableOf3D()) {
    // Versioned like the other scripts so a new card geometry never meets a cached stage3d.js.
    import(`./stage3d.js?v=${panel.dataset.stageV || "0"}`)
      .then(mod => mod.start({ panel, onStep: applyReadout }))
      .catch(err => { console.warn("3D stage unavailable, using the image stage.", err); imageStage(); });
  } else {
    imageStage();
  }
}

// Fallback stage: the card image with an SVG overlay that follows the step in view.
function imageStage() {
  const fig = document.querySelector("[data-stage-fig]");
  const steps = [...document.querySelectorAll(".step")];
  const hero = document.querySelector(".hero");
  let current = -1;
  const set = n => {
    if (n === current) return;
    current = n;
    fig.dataset.state = String(n);
    applyReadout(n);
  };
  const io = new IntersectionObserver(() => {
    const mid = innerHeight * 0.5;
    let n = 0;
    for (const step of steps) if (step.getBoundingClientRect().top < mid) n = Number(step.dataset.step);
    if (hero.getBoundingClientRect().bottom > mid) n = 0;
    set(n);
  }, { rootMargin: "-45% 0px -45% 0px", threshold: [0, 1] });
  steps.forEach(s => io.observe(s));
  io.observe(hero);
  set(0);
}

// One-shape loops (assets/js/flow.js): imported and mounted when the block comes near; each loop plays only
// while it is on screen. Reduced motion gets one still frame per loop.
function setupFlow() {
  const sec = document.querySelector("[data-flows]");
  if (!sec) return;
  const data = { labels: JSON.parse(sec.dataset.labels), card: JSON.parse(sec.dataset.card), images: JSON.parse(sec.dataset.images) };
  // Start only after the page has loaded and gone idle, so the loops never compete with the hero image.
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    import(`./flow.js?v=${sec.dataset.flowV || "0"}`).then(m => {
      for (const f of sec.querySelectorAll("[data-flow]")) m.mount(f, { segment: f.dataset.flow, ...data, still: reduceMotion });
    }).catch(err => console.warn("Flow animation unavailable.", err));
  }, { rootMargin: "200px 0px" });
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 200));
  const arm = () => idle(() => io.observe(sec), { timeout: 1500 });
  if (document.readyState === "complete") arm(); else addEventListener("load", arm, { once: true });
}
