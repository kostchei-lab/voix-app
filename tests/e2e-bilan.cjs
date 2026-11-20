// Test du bilan guidé : enregistrer, refaire, passer, questionnaire, préparation de l'envoi.
// Usage : node tests/e2e-bilan.cjs <voix.wav> <dossier-captures>
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const [wavPath, shotsDir] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

srv.listen(0, '127.0.0.1', async () => {
  const out = [];
  const check = (c, m) => out.push((c ? 'OK   ' : 'ÉCHEC ') + m);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wavPath}`] });
  try {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, permissions: ['microphone'] });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`http://localhost:${srv.address().port}/index.html#bilan`);
      await page.waitForSelector('#stepRec');
      if (scheme === 'light') await page.screenshot({ path: `${shotsDir}/b1-depart.png` });

      // B1 : enregistrer 1,5 s
      await page.click('#stepRec');
      await page.waitForFunction(() => window.__voix.engine.recording);
      await page.waitForTimeout(1500);
      await page.click('#stepRec');
      await page.waitForSelector('#stepNext');
      const status = await page.textContent('.step-status');
      check(/Prise gardée/.test(status), `[${scheme}] B1 gardée : « ${status.trim()} »`);
      await page.screenshot({ path: `${shotsDir}/b1-faite-${scheme}.png` });

      // B1 refaite : même identifiant, pas de doublon
      await page.click('#stepRec');
      await page.waitForTimeout(1200);
      await page.click('#stepRec');
      await page.waitForSelector('#stepNext');
      await page.click('#stepNext');
      await page.waitForFunction(() => document.querySelector('.step-head h2').textContent === 'Compter');
      await page.click('#stepRec');
      await page.waitForTimeout(1000);
      await page.click('#stepRec');
      await page.waitForSelector('#stepNext');

      // Aller à C7 et la passer
      await page.click('#bilanNav li:nth-child(14) button');
      await page.waitForFunction(() => document.querySelector('.step-head h2').textContent === 'Coup de soleil');
      await page.click('text=Passer cette chanson');
      await page.waitForFunction(() => document.querySelector('.step-head h2').textContent === 'Regresa a mí');

      // Questionnaire
      await page.click('#bilanNav li:nth-child(17) button');
      await page.fill('#bilanAnswers', '1. test\n5. 6/10');
      const before = await page.textContent('.step-head h2');
      await page.click('text=Suivant');
      await page.waitForTimeout(300);
      const after = await page.textContent('.step-head h2').catch(() => '?');
      if (!(await page.$('#bilanSendAll'))) { await page.screenshot({ path: `${shotsDir}/debug.png` }); throw new Error('étape après questionnaire : ' + before + ' → ' + after); }
      await page.screenshot({ path: `${shotsDir}/b-envoi-${scheme}.png` });
      const summary = await page.textContent('.step-how');
      check(/2 prises sur 16, 1 passée/.test(summary) && /Questionnaire rempli/.test(summary), `[${scheme}] récapitulatif : « ${summary.trim()} »`);

      const files = await page.evaluate(async () => {
        const fs = window.__voix.bilan.buildFiles();
        const q = fs.find((f) => f.name.endsWith('.txt'));
        return { names: fs.map((f) => f.name + ' ' + f.size), q: q ? await q.text() : '' };
      });
      check(files.names.length === 5, `[${scheme}] fichiers à envoyer : ${files.names.join(', ')}`);
      check(/Prises passées : C7-coup-de-soleil/.test(files.q) && /5\. 6\/10/.test(files.q), `[${scheme}] questionnaire inclus avec réponses et prises passées`);
      const ids = await page.evaluate(async () => (await window.__voix.store.all()).map((p) => p.id).sort());
      check(ids.join() === 'bilan-1/B1-lecture,bilan-1/B2-compter', `[${scheme}] prises en mémoire : ${ids.join(', ')}`);

      // Reprise après rechargement : on revient à l'envoi, état conservé
      await page.reload();
      await page.waitForSelector('#bilanSendAll');
      const chips = await page.$$eval('.nav-chip.done', (b) => b.map((x) => x.textContent));
      check(chips.join() === 'B1,B2,Q', `[${scheme}] après rechargement, étapes faites : ${chips.join(', ')}`);
      check(errors.length === 0, `[${scheme}] erreurs console : ${errors.join(' | ') || 'aucune'}`);
      await ctx.close();
    }
  } catch (e) {
    out.push('ÉCHEC exception : ' + e.message);
  }
  await browser.close();
  srv.close();
  console.log(out.join('\n'));
  process.exit(out.some((l) => l.startsWith('ÉCHEC')) ? 1 : 0);
});
