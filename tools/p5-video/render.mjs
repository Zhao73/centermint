// Renders the p5 sketch frame by frame in a throwaway headless Chrome and streams the PNG frames
// straight into ffmpeg (H.264 and VP9 at the same time). No frame files are written to disk.
//
//   node render.mjs                       # render + encode assets/video/measure-wide.{mp4,webm} and the poster
//   node render.mjs --frames 0,120,300    # preview: write just these frames to ./preview/ (no encode)
//
// Chrome: set CHROME_PATH, default is the system Google Chrome app on macOS. Needs ffmpeg and cwebp.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(HERE, '../..');
const OUT_DIR = path.join(SITE_ROOT, 'assets/video');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SPEC = { name: 'wide', w: 1280, h: 800, crf: 26, vp9crf: 38 };

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const frameList = argVal('--frames');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

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

function encoder(outArgs) {
  const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-', ...outArgs],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  return { p, done };
}
const write = (enc, buf) => new Promise(res => (enc.p.stdin.write(buf) ? res() : enc.p.stdin.once('drain', res)));

const srv = await serve();
const port = srv.address().port;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'p5video-chrome-'));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: profile, protocolTimeout: 600000,
  args: ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: SPEC.w, height: SPEC.h, deviceScaleFactor: 1 });
  page.on('console', (m) => console.log(`[sketch] ${m.text()}`));
  page.on('pageerror', (e) => console.error('[sketch] page error:', e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/p5-video/index.html?w=${SPEC.w}&h=${SPEC.h}&render=1`);
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  if (!(await page.evaluate(() => document.fonts.check('720 20px Archivo')))) throw new Error('Archivo font did not load');
  const total = await page.evaluate(() => window.LOOP_FRAMES);
  const posterFrame = await page.evaluate(() => window.POSTER_FRAME || 0);
  const grab = async (i) => Buffer.from((await page.evaluate((n) => {
    window.renderFrame(n);
    return document.getElementById('stage').toDataURL('image/png');
  }, i)).split(',')[1], 'base64');

  if (frameList) {
    const dir = path.join(HERE, 'preview');
    fs.mkdirSync(dir, { recursive: true });
    for (const i of frameList.split(',').map(Number)) fs.writeFileSync(path.join(dir, `${String(i).padStart(4, '0')}.png`), await grab(i));
    console.log('preview frames in', dir);
  } else {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const base = path.join(OUT_DIR, `measure-${SPEC.name}`);
    const h264 = encoder(['-c:v', 'libx264', '-preset', 'slow', '-crf', String(SPEC.crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-movflags', '+faststart', '-an', `${base}.mp4`]);
    const vp9 = encoder(['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(SPEC.vp9crf), '-deadline', 'good', '-cpu-used', '2',
      '-row-mt', '1', '-pix_fmt', 'yuv420p', '-an', `${base}.webm`]);
    for (let i = 0; i < total; i++) {
      const png = await grab(i);
      if (i === posterFrame) {
        const tmp = path.join(os.tmpdir(), `measure-poster-${process.pid}.png`);
        fs.writeFileSync(tmp, png);
        execFileSync('cwebp', ['-quiet', '-q', '80', tmp, '-o', `${base}-poster.webp`]);
        fs.unlinkSync(tmp);
      }
      await Promise.all([write(h264, png), write(vp9, png)]);
      if (i % 60 === 0) console.log(`frame ${i}/${total}`);
    }
    h264.p.stdin.end(); vp9.p.stdin.end();
    await Promise.all([h264.done, vp9.done]);
    console.log('wrote', `${base}.mp4`, `${base}.webm`, `${base}-poster.webp`);
  }
} finally {
  await browser.close();
  srv.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
