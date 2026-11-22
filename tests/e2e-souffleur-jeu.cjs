// Test de bout en bout de Souffleur, phase « travailler le jeu », avec un faux micro (fichier son).
// Usage : python3 tests/make-test-replique.py <replique.wav>
//         node tests/e2e-souffleur-jeu.cjs <racine du dépôt voix-app> <replique.wav> <dossier-captures>
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const [root, wavPath, shots] = process.argv.slice(2);
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
const SCENE = `# Essai d’import
@moi ANNE
JEAN : Tu pars déjà ?
ANNE : Oui. / Il est *tard*.
> intention : Elle coupe court.
> conseil : Pas de sourire.
JEAN : Reste un peu.`;

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://localhost:${srv.address().port}/souffleur/`;
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(wavPath)}`, '--autoplay-policy=no-user-gesture-required'] });
  const out = [];
  const check = (c, m) => out.push((c ? 'OK   ' : 'ÉCHEC ') + m);
  let first = true;
  for (const [scheme, width, height] of [['light', 390, 844], ['dark', 390, 844], ['light', 1280, 900]]) {
    const tag = `[${scheme} ${width}]`;
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', (d) => d.accept());
    await page.goto(url);
    const text = (s) => page.$eval(s, (n) => n.textContent);
    const count = (s) => page.$$eval(s, (n) => n.length);
    await page.waitForSelector('.scene-card');
    check((await text('#list')).includes('Le retour (scène d’exemple)PAUL · 3 répliques à toi'), `${tag} scène d’exemple dans la liste`);

    await page.click('.scene-card');
    check((await count('.card.mine')) === 3 && (await count('.partner')) === 3, `${tag} 3 répliques à toi, 3 du partenaire`);
    check((await count('#line-1 .stress')) === 2 && (await count('#line-1 .breath')) === 3, `${tag} mots à appuyer et respirations affichés`);
    check((await text('#line-1 .notes')).includes('Intention : Il a longtemps retenu'), `${tag} lecture de Claude sous la réplique`);

    // Une prise de 7 s (le faux micro joue la réplique de test en boucle)
    const btn = '#line-1 button.rec';
    await page.click(btn);
    await page.waitForFunction((s) => document.querySelector(s).textContent.startsWith('Arrêter'), btn);
    await page.waitForTimeout(7200);
    await page.click(btn);
    await page.waitForSelector('#line-1 .result canvas');
    const stats = await text('#line-1 .stats');
    check(/Débit\d+,\d syllabes\/s/.test(stats), `${tag} débit mesuré : ${stats.match(/Débit[^≈]*/)[0]}`);
    const np = +(stats.match(/Pauses(\d+)/) || [])[1];
    check(np >= 2 && stats.includes('Claude propose 3 respirations'), `${tag} ${np} pauses trouvées, comparées aux 3 respirations proposées`);
    check(/Mélodie\d+ demi-tons/.test(stats) && /fin (montante|descendante|plate)/.test(stats), `${tag} mélodie : ${stats.match(/Mélodie.*?\)/)}`);
    check(await page.$eval('#line-1 audio', (a) => a.src.startsWith('blob:')), `${tag} prise réécoutable`);
    const painted = await page.$eval('#line-1 canvas', (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0));
    check(painted, `${tag} courbe dessinée`);
    if (width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-prise.png`, fullPage: false, clip: await page.$eval('#line-1', (n) => { const r = n.getBoundingClientRect(); return { x: 0, y: r.top + window.scrollY, width: window.innerWidth, height: Math.min(r.height, 900) }; }) });

    // Deuxième prise : la précédente est rappelée
    await page.click(btn);
    await page.waitForTimeout(3000);
    await page.click(btn);
    await page.waitForSelector('#line-1 .prev');
    check((await text('#line-1 .prev')).startsWith('Prise précédente :'), `${tag} prise précédente rappelée`);

    // Rechargement : la dernière prise est gardée
    await page.reload();
    await page.click('.scene-card');
    check((await text('#line-1 .result')).startsWith('Dernière prise :'), `${tag} dernière prise gardée après rechargement`);

    if (first) {
      // Import d'une scène annotée
      await page.click('#scBack');
      await page.click('#addBtn');
      check((await text('#prompt')).includes('@moi NOM DE MON PERSONNAGE'), `${tag} message pour Claude affiché`);
      await page.click('#copyPrompt');
      await page.fill('#raw', 'pas de réplique ici');
      await page.click('#imSave');
      check((await text('#imMsg')).includes('aucune réplique'), `${tag} texte sans réplique refusé`);
      await page.fill('#raw', SCENE);
      await page.click('#imSave');
      check((await text('#scTitle')) === 'Essai d’import' && (await count('.card.mine')) === 1 && (await count('.partner')) === 2, `${tag} scène importée (ANNE, 1 réplique)`);
      await page.click('#delBtn');
      check(!(await text('#list')).includes('Essai d’import'), `${tag} scène supprimée`);
    }
    await page.screenshot({ path: `${shots}/${scheme}-${width}-accueil.png` });
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
