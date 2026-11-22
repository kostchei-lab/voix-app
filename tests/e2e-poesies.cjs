// Test de bout en bout de « Mes poésies » avec une reconnaissance simulée.
// Usage : node tests/e2e-poesies.cjs <racine du dépôt voix-app> <dossier-captures>
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const [root, shots] = process.argv.slice(2);
const ROOT = path.resolve(root);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
const FAKE = `
  window.__recs = [];
  class FakeRec {
    constructor() { window.__rec = this; window.__recs.push(this); this.results = []; }
    start() { setTimeout(() => { this.onstart && this.onstart(); this.onaudiostart && this.onaudiostart(); }, 10); }
    stop() { setTimeout(() => this.onend && this.onend(), 10); }
  }
  window.webkitSpeechRecognition = FakeRec;
  window.SpeechRecognition = FakeRec;
  window.__say = (text, final = true) => {
    const r = window.__rec; const item = [{ transcript: text }]; item.isFinal = final;
    if (r.results.length && !r.results[r.results.length - 1].isFinal) r.results.pop();
    r.results.push(item);
    r.onresult && r.onresult({ results: r.results });
  };
  window.__end = () => { const r = window.__rec; r.onend && r.onend(); };
`;

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://localhost:${srv.address().port}/poesies/`;
  const browser = await chromium.launch();
  const out = [];
  const check = (c, m) => out.push((c ? 'OK   ' : 'ÉCHEC ') + m);
  let first = true;
  for (const [scheme, width, height] of [['light', 820, 1180], ['dark', 390, 844], ['light', 1280, 900]]) {
    const tag = `[${scheme} ${width}]`;
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
    await ctx.addInitScript(FAKE);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', (d) => d.accept());
    await page.goto(url);
    const text = (s) => page.$eval(s, (n) => n.textContent);
    const say = (t, f = true) => page.evaluate(([a, b]) => window.__say(a, b), [t, f]);
    const count = (sel) => page.$$eval(sel, (n) => n.length);
    const poemWords = await page.evaluate(() => {
      const lines = JSON.parse(JSON.stringify(EXAMPLE.text)).split('\n');
      return lines.map((l) => l.replace(/[«»:;!?.,]/g, ' ').replace(/\s+/g, ' ').trim());
    });
    const all = poemWords.join(' ');
    check((await text('#list')).includes('Le Corbeau et le Renard') && (await text('#list')).includes('nouvelle'), `${tag} bibliothèque avec la poésie d’exemple`);

    // Étape 1 : je lis ; une coupure de l'écoute par l'iPad est relancée sans perdre la place
    await page.click('.poem-card');
    check((await page.getAttribute('#step-lire', 'aria-pressed')) === 'true' && (await count('.poem .w.mask')) === 0, `${tag} étape « Je lis », texte visible`);
    await page.click('#go');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('je t’écoute'));
    await say(poemWords.slice(0, 2).join(' '));
    const d1 = await count('.poem .w.done');
    check(d1 === 12, `${tag} deux vers suivis : ${d1} mots verts`);
    await page.evaluate(() => window.__end());
    await page.waitForTimeout(50);
    check((await page.evaluate(() => window.__recs.length)) === 2, `${tag} écoute relancée après une coupure`);
    await say(poemWords.slice(2).join(' '));
    await page.waitForSelector('#bravo:not([hidden])');
    check((await text('#bravo')).includes('Bravo, sans aucune aide') && (await count('#bravo .stars .off')) === 0, `${tag} fin de l’étape 1 : 3 étoiles`);
    if (width === 820) await page.screenshot({ path: `${shots}/${scheme}-${width}-bravo.png` });

    // Étape 2 : avec des trous ; un mot oublié (« perché ») est marqué sauté
    await page.click('#bravo button');
    check((await page.getAttribute('#step-trous', 'aria-pressed')) === 'true' && (await count('.poem .w.mask')) > 20, `${tag} étape « Avec des trous » : ${await count('.poem .w.mask')} mots cachés`);
    await page.click('#go');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('je t’écoute'));
    await say(all.replace('arbre perché', 'arbre'));
    await page.waitForSelector('#bravo:not([hidden])');
    check((await text('#bravo')).includes('1 mot sauté') && (await count('.poem .w.skip')) === 1, `${tag} un mot sauté, en orange, 2 étoiles`);

    // Étape 3 : par cœur ; le souffleur donne une lettre, puis deux
    await page.click('#bravo button');
    check((await count('.poem .w.mask')) === (await count('.poem .w')), `${tag} étape « Par cœur » : tout est caché`);
    await page.click('#go');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('je t’écoute'));
    await say(poemWords[0]);
    await page.waitForTimeout(3500);
    const b1 = await text('#bubble');
    check(b1.includes('Ça commence par « T »'), `${tag} souffleur après 3 s : ${b1}`);
    await page.waitForTimeout(2400);
    const b2 = await text('#bubble');
    check(b2.includes('« Te »'), `${tag} puis une lettre de plus : ${b2}`);
    if (width !== 1280) await page.screenshot({ path: `${shots}/${scheme}-${width}-souffleur.png` });
    await say(poemWords.slice(1).join(' '));
    await page.waitForSelector('#bravo:not([hidden])');
    check((await text('#bravo')).includes('1 mot soufflé') && (await count('.poem .w.hinted')) === 1, `${tag} fin par cœur : 1 mot soufflé (en bleu)`);

    if (first) {
      // Plus rien d'entendu pendant 15 s : pause, puis « Je continue » reprend à la même place
      await page.click('#go');
      await page.waitForFunction(() => document.querySelector('#status').textContent.includes('je t’écoute'));
      await say(poemWords.slice(0, 3).join(' '));
      await page.waitForFunction(() => !document.querySelector('#resume').hidden, null, { timeout: 20000 });
      check((await text('#status')).includes('Je n’entends plus rien'), `${tag} pause après 15 s de silence`);
      await page.click('#resume');
      await page.waitForFunction(() => document.querySelector('#status').textContent.includes('je t’écoute'));
      await say(poemWords.slice(3).join(' '));
      await page.waitForSelector('#bravo:not([hidden])');
      check((await text('#bravo')).includes('aucun mot sauté'), `${tag} reprise à la même place, fin sans mot sauté`);

      // Ajout d'une poésie
      await page.click('#rdBack');
      await page.click('#addBtn');
      await page.fill('#edTitle', 'Essai');
      await page.fill('#edText', 'Il pleut sur la ville\nComme il pleut sur mon cœur');
      await page.click('#edSave');
      check((await text('#rdTitle')) === 'Essai' && (await count('.poem .l')) === 2, `${tag} poésie ajoutée, deux vers`);
      await page.click('#go');
      await page.waitForFunction(() => document.querySelector('#status').textContent.includes('je t’écoute'));
      await say('il pleut sur la ville comme il pleut sur mon cœur');
      await page.waitForSelector('#bravo:not([hidden])');
      check((await text('#bravo')).includes('Bravo'), `${tag} « cœur » reconnu (œ)`);
      await page.click('#rdBack');
    } else await page.click('#rdBack');

    // Rechargement : les étoiles et les poésies sont gardées ; suppression
    await page.reload();
    const lib = await text('#list');
    check(lib.includes('Par cœur') && (first ? lib.includes('Essai') : true), `${tag} progrès gardés après rechargement`);
    if (first) {
      await page.click('.poem-card:nth-child(2)');
      await page.click('#delBtn');
      check(!(await text('#list')).includes('Essai'), `${tag} suppression d’une poésie`);
    }
    await page.screenshot({ path: `${shots}/${scheme}-${width}-bibliotheque.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!overflow, `${tag} pas de défilement horizontal`);
    check(errors.length === 0, `${tag} aucune erreur JavaScript ${errors.join(' | ')}`);
    await ctx.close();
    first = false;
  }
  await browser.close();
  srv.close();
  console.log(out.join('\n'));
  process.exit(out.some((l) => l.startsWith('ÉCHEC')) ? 1 : 0);
})();
