// Test de bout en bout : Chromium sans écran, micro remplacé par un fichier WAV.
// Usage : node tests/e2e.cjs <voix.wav> <dossier-captures>
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const [wavPath, shotsDir] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wavPath}`, '--autoplay-policy=no-user-gesture-required'],
  });
  const results = [];
  const fail = (m) => { results.push('ÉCHEC ' + m); };
  const ok = (m) => { results.push('OK   ' + m); };

  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, permissions: ['microphone'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.__voix);
    if (scheme === 'light') await page.screenshot({ path: `${shotsDir}/0-accueil.png` });

    await page.click('#btnMic');
    await page.waitForFunction(() => window.__voix.engine.running, null, { timeout: 10000 });
    // Collecte des mesures pendant 9 s (une boucle complète du fichier)
    const frames = await page.evaluate(() => new Promise((resolve) => {
      const out = [];
      const h = (e) => out.push({ t: e.detail.t, f0: e.detail.f0, db: e.detail.db });
      window.__voix.engine.addEventListener('frame', h);
      setTimeout(() => { window.__voix.engine.removeEventListener('frame', h); resolve(out); }, 9000);
    }));
    const rate = frames.length / 9;
    (rate > 45 && rate < 55 ? ok : fail)(`[${scheme}] ${rate.toFixed(1)} analyses/s (attendu ≈ 50)`);
    const voiced = frames.filter((f) => f.f0 > 0);
    const near = (hz) => voiced.filter((f) => Math.abs(1200 * Math.log2(f.f0 / hz)) < 10).length;
    const n110 = near(110), n220 = near(220);
    (n110 > 70 ? ok : fail)(`[${scheme}] 110 Hz reconnu sur ${n110} mesures (≈ 100 attendues)`);
    (n220 > 70 ? ok : fail)(`[${scheme}] 220 Hz reconnu sur ${n220} mesures (≈ 100 attendues)`);
    const glide = voiced.filter((f) => f.f0 > 152 && f.f0 < 248 && Math.abs(1200 * Math.log2(f.f0 / 220)) > 15).length;
    (glide > 60 ? ok : fail)(`[${scheme}] glissade 150 → 250 Hz suivie sur ${glide} mesures`);
    const octave = voiced.filter((f) => f.f0 > 400 || f.f0 < 90).length;
    (octave < 5 ? ok : fail)(`[${scheme}] ${octave} erreur(s) d'octave`);

    await page.waitForTimeout(600);
    await page.screenshot({ path: `${shotsDir}/1-miroir-${scheme}.png` });

    // Enregistrement
    await page.click('#btnRec');
    await page.waitForTimeout(3200);
    await page.click('#btnRec');
    await page.waitForTimeout(800);
    const prises = await page.evaluate(async () => (await window.__voix.store.all()).map((p) => ({ name: p.name, dur: p.duration, sr: p.sampleRate, wav: p.wav.size, frames: p.frames.t.length, s: p.summary })));
    (prises.length === 1 ? ok : fail)(`[${scheme}] ${prises.length} prise enregistrée`);
    if (prises[0]) {
      const p = prises[0];
      (Math.abs(p.dur - 3.2) < 0.4 ? ok : fail)(`[${scheme}] durée ${p.dur.toFixed(2)} s`);
      (Math.abs(p.wav - (44 + Math.round(p.dur * p.sr) * 2)) < 8 ? ok : fail)(`[${scheme}] WAV ${p.wav} octets à ${p.sr} Hz`);
      (p.frames > 140 ? ok : fail)(`[${scheme}] ${p.frames} mesures dans la prise`);
    }

    await page.click('.tabs button[data-tab="prises"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shotsDir}/2-prises-${scheme}.png` });
    await page.click('.tabs button[data-tab="micro"]');
    await page.waitForTimeout(500);
    const info = await page.textContent('#micInfo');
    (/Annulation d'écho\s*désactivé/.test(info) ? ok : fail)(`[${scheme}] traitements coupés : ${info.replace(/\s+/g, ' ').trim()}`);
    await page.screenshot({ path: `${shotsDir}/3-micro-${scheme}.png`, fullPage: true });

    // Lecture : coupe le micro
    await page.click('.tabs button[data-tab="prises"]');
    await page.click('.prise-actions .btn');
    await page.waitForTimeout(500);
    const running = await page.evaluate(() => window.__voix.engine.running);
    (!running ? ok : fail)(`[${scheme}] micro coupé pendant l'écoute`);

    (errors.length === 0 ? ok : fail)(`[${scheme}] erreurs console : ${errors.length ? errors.join(' | ') : 'aucune'}`);
    await ctx.close();
  }
  await browser.close();
  srv.close();
  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('ÉCHEC'))) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
