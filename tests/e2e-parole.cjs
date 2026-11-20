// Test de bout en bout de l'échelle de projection : Chromium sans écran, faux micro silencieux,
// phrases injectées comme mesures (hauteur, volume) pour dérouler une séance complète.
// Usage : node tests/e2e-parole.cjs <silence.wav> <dossier-captures>
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
  const url = `http://localhost:${srv.address().port}/index.html#parole`;
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wavPath}`],
  });
  const results = [];
  const check = (c, m) => results.push((c ? 'OK   ' : 'ÉCHEC ') + m);

  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: scheme, permissions: ['microphone'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.__voix && document.querySelector('#btnProjStart'));
    const shot = (name) => page.screenshot({ path: `${shotsDir}/${scheme}-${name}.png` });
    await shot('1-menu');

    // Injecte n mesures voisées (une phrase), en une fois.
    const say = (hz, db, n = 100) => page.evaluate(([hz, db, n]) => {
      const e = window.__voix.engine;
      for (let i = 0; i < n; i++) {
        e.dispatchEvent(new CustomEvent('frame', { detail: { t: 0, f0: hz * (1 + 0.008 * Math.sin(i / 4)), clarity: 0.95, db: db + ((i % 5) - 2) * 0.5 } }));
      }
    }, [hz, db, n]);
    const verdict = () => page.waitForFunction(() => window.__voix.parole.state().phase === 'verdict', null, { timeout: 5000 });
    const text = (sel) => page.$eval(sel, (n) => n.textContent);

    await page.click('#btnProjStart');
    await page.waitForFunction(() => window.__voix.engine.running && window.__voix.parole.state().phase === 'listening', null, { timeout: 10000 });
    check(true, `[${scheme}] micro ouvert, écoute de la référence`);

    // Référence : 150 Hz, −30 dB
    await say(150, -30);
    await verdict();
    check((await text('#projStatus')).includes('150 Hz'), `[${scheme}] référence notée à 150 Hz`);
    await shot('2-reference');

    // +2 dB : 155 Hz, −27,8 dB → réussi
    await page.click('#btnProjNext');
    await say(155, -27.8, 40);
    await page.waitForTimeout(150);
    const live = await page.$eval('.gauge-value', (n) => n.textContent);
    check(/\+2/.test(live), `[${scheme}] jauge de volume en direct : ${live}`);
    await shot('3-jauges-direct');
    await say(155, -27.8, 60);
    await verdict();
    check((await text('#projStatus')).includes('Palier réussi'), `[${scheme}] palier +2 réussi`);

    // +4 dB : 158 Hz, −25,8 dB → réussi
    await page.click('#btnProjNext');
    await say(158, -25.8);
    await verdict();
    check((await text('#projStatus')).includes('Palier réussi'), `[${scheme}] palier +4 réussi`);

    // +6 dB : 185 Hz → la voix monte trop
    await page.click('#btnProjNext');
    await say(185, -24);
    await verdict();
    const st = await text('#projStatus');
    check(st.includes('Pas encore') && st.includes('limite'), `[${scheme}] palier +6 refusé, hauteur trop haute`);
    await shot('4-verdict-rate');

    // Refaire : 163 Hz → réussi
    await page.click('#btnProjAgain');
    await say(163, -23.9);
    await verdict();
    check((await text('#projStatus')).includes('Palier réussi'), `[${scheme}] palier +6 réussi au 2e essai`);

    // Sans regarder : jauges masquées pendant l'écoute
    await page.click('#btnProjNext');
    check(await page.$('.blind') !== null && await page.$('.gauges') === null, `[${scheme}] jauges masquées sans regarder`);
    await shot('5-sans-regarder');
    await say(170, -24);
    await verdict();
    check(await page.$('.gauges') !== null, `[${scheme}] jauges révélées après le verdict`);

    // Score
    await page.click('#btnProjNext');
    await page.waitForSelector('.score-num');
    const s = await page.evaluate(() => window.__voix.parole.state().seance.record.score);
    check(s.fiable && s.monteeA6 > 1 && s.monteeA6 < 2.5, `[${scheme}] montée estimée à +6 dB : ${s.monteeA6.toFixed(2)} dt, pente ${s.penteCentsParDb.toFixed(0)} c/dB`);
    check(s.paliers === 4 && s.reussis === 3, `[${scheme}] ${s.reussis}/${s.paliers} paliers réussis`);
    await shot('6-score');

    // Historique : une deuxième séance (ancienne) pour la courbe
    await page.evaluate(() => window.__voix.store.putSeance({ id: 'proj-0', exo: 'projection', date: '2026-11-18T18:00:00.000Z', essais: [], score: { paliers: 4, reussis: 1, penteCentsParDb: 75, monteeA6: 4.5, aveugle: null, fiable: true } }));
    await page.click('text=Terminé');
    await page.waitForSelector('.seance');
    await page.evaluate(() => window.__voix.parole.open());
    await page.waitForSelector('.trend svg');
    const n = await page.$$eval('.seance', (l) => l.length);
    check(n === 2, `[${scheme}] historique : ${n} séances, courbe affichée`);
    await shot('7-historique');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!overflow, `[${scheme}] pas de défilement horizontal à 390 px`);
    check(errors.length === 0, `[${scheme}] aucune erreur JavaScript ${errors.join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
  srv.close();
  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('ÉCHEC')) ? 1 : 0);
})();
