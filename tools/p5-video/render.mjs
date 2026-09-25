// Renders the p5 sketch frame by frame in a throwaway headless Chrome,
// then (unless --no-encode) encodes MP4 / WebM / WebP poster with ffmpeg + cwebp.
//
//   node render.mjs                     # both renditions, all frames, encode
//   node render.mjs --only wide         # one rendition
//   node render.mjs --frames 0,120,300  # just these frames (preview; no encode)
//
// Chrome: set CHROME_PATH, default is the system Google Chrome app on macOS.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(HERE, '../..');
const OUT_DIR = path.join(SITE_ROOT, 'assets/video');
const FRAMES_DIR = path.join(HERE, 'frames');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const RENDITIONS = {
  wide: { w: 1280, h: 800, crf: 26, vp9crf: 38 },
  tall: { w: 720, h: 900, crf: 26, vp9crf: 38 },
};
const POSTER_FRAME = 0; // sketch OFFSET makes frame 0 a fully measured card

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const only = argVal('--only');
const frameList = argVal('--frames');
const encode = !args.includes('--no-encode') && !frameList;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const file = path.join(SITE_ROOT, p);
      if (!file.startsWith(SITE_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function renderOne(browser, port, name, spec) {
  const page = await browser.newPage();
  await page.setViewport({ width: spec.w, height: spec.h, deviceScaleFactor: 1 });
  page.on('console', (m) => console.log(`[${name}] ${m.text()}`));
  page.on('pageerror', (e) => console.error(`[${name}] page error:`, e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/p5-video/index.html?w=${spec.w}&h=${spec.h}&render=1`);
  await page.waitForFunction('window.__ready === true', { timeout: 20000 });
  const fontOk = await page.evaluate(() => document.fonts.check('600 20px Archivo'));
  if (!fontOk) throw new Error('Archivo font did not load');
  const total = await page.evaluate(() => window.LOOP_FRAMES);
  const frames = frameList ? frameList.split(',').map(Number) : [...Array(total).keys()];

  const dir = path.join(FRAMES_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  if (!frameList) for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));

  for (const i of frames) {
    const dataUrl = await page.evaluate((n) => {
      window.renderFrame(n);
      return document.getElementById('stage').toDataURL('image/png');
    }, i);
    fs.writeFileSync(path.join(dir, `${String(i).padStart(4, '0')}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    if (i % 60 === 0) process.stdout.write(`[${name}] frame ${i}/${total}\n`);
  }
  await page.close();
  return { dir, total };
}

function run(cmd, a) {
  console.log('$', cmd, a.join(' '));
  execFileSync(cmd, a, { stdio: ['ignore', 'inherit', 'inherit'] });
}

function encodeOne(name, spec, dir) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const input = ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.png')];
  run('ffmpeg', [...input, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(spec.crf), '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-movflags', '+faststart', '-an', path.join(OUT_DIR, `measure-${name}.mp4`)]);
  const passlog = path.join(os.tmpdir(), `measure-${name}-vp9`);
  const vp9 = ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(spec.vp9crf), '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-pix_fmt', 'yuv420p', '-an', '-passlogfile', passlog];
  run('ffmpeg', [...input, ...vp9, '-pass', '1', '-f', 'null', '/dev/null']);
  run('ffmpeg', [...input, ...vp9, '-pass', '2', path.join(OUT_DIR, `measure-${name}.webm`)]);
  run('cwebp', ['-quiet', '-q', '80', path.join(dir, `${String(POSTER_FRAME).padStart(4, '0')}.png`), '-o', path.join(OUT_DIR, `measure-${name}-poster.webp`)]);
}

const srv = await serve();
const port = srv.address().port;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'p5video-chrome-'));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  userDataDir: profile,
  args: ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars'],
});
try {
  for (const [name, spec] of Object.entries(RENDITIONS)) {
    if (only && only !== name) continue;
    const { dir } = await renderOne(browser, port, name, spec);
    if (encode) encodeOne(name, spec, dir);
  }
} finally {
  await browser.close();
  srv.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
