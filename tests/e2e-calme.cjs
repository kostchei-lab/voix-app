// Test de bout en bout de la zone calme : Chromium sans écran, faux micro silencieux,
// phrases injectées comme mesures (hauteur, volume) pour dérouler une séance complète.
// Usage : node tests/e2e-calme.cjs <silence.wav> <dossier-captures>
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

  for (const [scheme, width, height] of [['light', 390, 844], ['dark', 390, 844], ['light', 1280, 900]]) {
    const tag = `[${scheme} ${width}]`;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: scheme, permissions: ['microphone'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.__voix && document.querySelector('#btnCalmeStart'));
    const shot = (name) => page.screenshot({ path: `${shotsDir}/${scheme}-${width}-${name}.png` });
    if (width > 400) await page.evaluate(() => document.querySelector('#btnCalmeStart').scrollIntoView());
    await shot('1-menu');

    // Injecte une parole : n mesures voisées autour de hz, mélodie de ±3 dt (une oscillation par seconde),
    // datées juste avant l'instant présent pour que la courbe les affiche.
    const say = (hz, n = 150, gap = 0) => page.evaluate(([hz, n, gap]) => {
      const e = window.__voix.engine;
      const now = e.ctx ? e.ctx.currentTime : 0;
      const total = n + gap;
      for (let i = 0; i < total; i++) {
        const silent = gap && i >= n / 2 && i < n / 2 + gap;
        const m = 69 + 12 * Math.log2(hz / 440) + 3 * Math.sin((2 * Math.PI * i) / 50);
        const f0 = silent ? 0 : 440 * Math.pow(2, (m - 69) / 12);
        e.dispatchEvent(new CustomEvent('frame', { detail: { t: now - (total - i) * 0.02, f0, clarity: 0.95, db: silent ? -70 : -30 } }));
      }
    }, [hz, n, gap]);
    const calme = () => page.evaluate(() => window.__voix.parole.calme.state());
    const verdict = () => page.waitForFunction(() => window.__voix.parole.calme.state().phase === 'verdict', null, { timeout: 6000 });
    const text = (sel) => page.$eval(sel, (n) => n.textContent);
    const lastEssai = async () => { const s = await calme(); return s.seance.essais[s.seance.essais.length - 1]; };

    await page.click('#btnCalmeStart');
    await page.waitForFunction(() => window.__voix.engine.running && window.__voix.parole.calme.state().phase === 'listening', null, { timeout: 10000 });
    check(await page.$('#calmeTrace') !== null, `${tag} micro ouvert, courbe affichée pour l'étape assis`);

    // 1. Assis : 132 Hz
    await say(132);
    await verdict();
    let st = await text('#calmeStatus');
    check(st.includes('Dans la zone') && st.includes('Ta voix assise : 132 Hz'), `${tag} assis : dans la zone, 132 Hz (${st})`);
    await shot('2-assis');

    // 2. Debout : d'abord à 165 Hz (bilan 1), retour en direct puis verdict « au-dessus »
    await page.click('#btnCalmeNext');
    await say(165, 60);
    await page.waitForTimeout(250);
    const liveMsg = await text('#calmeMsg');
    const out = await page.$eval('#calmeStage', (n) => n.classList.contains('out'));
    check(liveMsg.includes('Au-dessus') && out, `${tag} retour en direct quand la voix sort : « ${liveMsg} », cadre rouge`);
    await shot('3-direct-hors-zone');
    await verdict();
    st = await text('#calmeStatus');
    check(st.includes('Au-dessus de la zone') && st.includes('mm-hmm'), `${tag} debout à 165 Hz : au-dessus, avec le conseil`);
    await shot('4-verdict-au-dessus');
    await page.click('#btnCalmeAgain');
    await say(140);
    await page.waitForTimeout(250);
    check((await text('#calmeMsg')).includes('Dans la zone'), `${tag} retour en direct dans la zone à 140 Hz`);
    await verdict();
    check((await text('#calmeStatus')).includes('Dans la zone'), `${tag} debout à 140 Hz : réussi au 2e essai`);

    // 3. Deux phrases séparées d'une pause de 0,6 s : une seule mesure
    await page.click('#btnCalmeNext');
    await say(143, 200, 30);
    await verdict();
    const e3 = await lastEssai();
    check(e3.step === 'deux' && e3.n === 200 && e3.ok, `${tag} deux phrases mesurées ensemble (${e3.n} mesures voisées), réussi`);

    // 4. Parole libre : 6 s de voix, compteur, puis « J'ai fini »
    await page.click('#btnCalmeNext');
    check(await page.$('#calmeStatus .read') === null && await page.$('.step .read') === null, `${tag} parole libre : pas de texte à lire`);
    await say(147, 300);
    await page.waitForTimeout(250);
    const t = await text('#calmeTime');
    check(t.startsWith('6 s'), `${tag} parole libre : compteur « ${t} »`);
    await page.click('#btnCalmeDone');
    await verdict();
    st = await text('#calmeStatus');
    check(st.includes('Au-dessus de la zone') && st.includes('147 Hz'), `${tag} parole libre à 147 Hz : au-dessus (objectif bilan 2 atteint, zone non) (${st})`);

    // 5. Sans regarder : courbe masquée, puis révélée au verdict
    await page.click('#btnCalmeNext');
    check(await page.$('.blind') !== null && await page.$('#calmeStage') === null, `${tag} sans regarder : courbe masquée`);
    await shot('5-sans-regarder');
    await say(138);
    await verdict();
    check(await page.$('#calmeStage') !== null && (await text('#calmeStatus')).includes('Dans la zone'), `${tag} sans regarder : courbe révélée, dans la zone`);
    await shot('6-verdict-sans-regarder');

    // Score
    await page.click('#btnCalmeNext');
    await page.waitForSelector('.score-num');
    const s = (await calme()).seance.record.score;
    check(s.etapes === 5 && s.reussies === 4, `${tag} ${s.reussies}/${s.etapes} étapes réussies ${JSON.stringify((await calme()).seance.essais.map((e) => [e.step, e.hz, e.ok]))}`);
    check(s.centreDebout > 140 && s.centreDebout < 147, `${tag} centre debout ${s.centreDebout.toFixed(1)} Hz, ${s.pctZoneDebout.toFixed(0)} % dans la zone, assis → debout ${s.ecartAssisDebout.toFixed(2)} dt`);
    await shot('7-score');

    // Historique, avec une séance plus ancienne pour la courbe, puis rechargement de la page
    await page.evaluate(() => window.__voix.store.putSeance({ id: 'calme-0', exo: 'calme', date: '2026-11-18T18:00:00.000Z', essais: [], score: { etapes: 5, reussies: 1, centreDebout: 158, pctZoneDebout: 12, assis: 133, ecartAssisDebout: 2.9, aveugle: { hz: 160, ok: false } } }));
    await page.click('text=Terminé');
    await page.waitForSelector('#calmeHistory .seance');
    await page.reload();
    await page.waitForFunction(() => window.__voix && document.querySelector('#calmeHistory'));
    await page.waitForSelector('#calmeTrend svg');
    const n = await page.$$eval('#calmeHistory .seance', (l) => l.length);
    check(n === 2, `${tag} après rechargement : ${n} séances gardées, courbe affichée`);
    await page.evaluate(() => document.querySelector('#calmeHistory').scrollIntoView());
    await shot('8-historique');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!overflow, `${tag} pas de défilement horizontal`);
    check(errors.length === 0, `${tag} aucune erreur JavaScript ${errors.join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
  srv.close();
  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('ÉCHEC')) ? 1 : 0);
})();
