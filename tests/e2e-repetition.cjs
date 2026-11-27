// Test de bout en bout de « Répétition » (révision d'un rôle) avec une reconnaissance simulée.
// Seul texte utilisé : la scène inventée « Cent douze marches » (aucun vrai rôle dans les tests).
// Usage : node tests/e2e-repetition.cjs <racine du dépôt voix-app> <dossier-captures>
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const [root, shots] = process.argv.slice(2);
const ROOT = path.resolve(root);
fs.mkdirSync(shots, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// ---------- La scène inventée, sous trois formes de fichier ----------
const PAIRS = [
  ['Monsieur Gaspard ? On m’a dit que je vous trouverais ici, tout en haut.', 'Où voulez-vous que je sois ? Depuis trente ans, je monte ces cent douze marches deux fois par jour.'],
  ['Je viens de la part de la Direction des phares. J’ai une lettre pour vous.', 'Une lettre ? Posez-la sur la table, à côté de la lampe. Je la lirai quand la nuit sera tombée.'],
  ['Il vaudrait mieux la lire maintenant. Elle vous concerne directement.', 'Tout ce qui arrive ici me concerne directement, mademoiselle. Le vent, les bateaux, les mouettes, et maintenant vous.'],
  ['Le phare sera automatisé au printemps. Vous n’aurez plus besoin de monter.', 'Plus besoin de monter… Vous croyez qu’on monte cent douze marches parce qu’on en a besoin ?'],
  ['Que ferez-vous, alors ?', 'Je regarderai la lumière depuis la côte, comme tout le monde. Et je me demanderai qui veille sur elle.'],
  ['Personne. Une machine s’allumera seule, chaque soir, à la même heure.', 'Une machine ne sait pas qu’il y a de la brume avant qu’elle n’arrive. Moi, je la sens dans mes genoux, deux jours avant les marins.'],
  ['Je suis désolée, monsieur Gaspard. Ce n’est pas moi qui décide.', 'Je sais bien. Personne ne décide jamais rien. Asseyez-vous donc, le café est encore chaud.'],
  ['Vous ne m’en voulez pas ?', 'À vous ? Non. Vous avez monté les cent douze marches. Ça mérite au moins une tasse.'],
];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repetition-'));
const TXT = path.join(tmp, 'scene.txt');
fs.writeFileSync(TXT, 'Cent douze marches\n\n' + PAIRS.map(([s, l]) => `L’INSPECTRICE : ${s}\nGASPARD : ${l}`).join('\n') + '\n');

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const locals = [], centrals = [];
  let off = 0;
  for (const { name, data } of files) {
    const nb = Buffer.from(name), comp = zlib.deflateRawSync(data), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, comp); centrals.push(ch, nb);
    off += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const para = (...runs) => `<w:p>${runs.map((r) => `<w:r><w:t xml:space="preserve">${esc(r)}</w:t></w:r>`).join('')}</w:p>`;
const docBody = [para('CENT DOUZE MARCHES'), para('SCÈNE PREMIÈRE'), para('Un phare, tout en haut. (Le vent souffle.)')];
PAIRS.forEach(([s, l], i) => {
  docBody.push(para('L’INSPECTRICE. — ', s));
  if (i === 2) docBody.push(para('GASPARD, ', 'sans se retourner. — ', '(Il se lève.) ', l));
  else docBody.push(para('GASPARD. — ', l));
});
const DOCX = path.join(tmp, 'scene.docx');
fs.writeFileSync(DOCX, zip([
  { name: '[Content_Types].xml', data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
  { name: 'word/document.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${docBody.join('')}</w:body></w:document>`) },
]));
const PDF = path.join(tmp, 'scene.pdf');
const POEM = 'Le vent du soir\n\nLe vent du soir passe la porte,\nIl cherche un coin pour se poser,\nMais la maison est déjà morte\nEt les volets sont bien fermés.\n\nAlors il monte sur le toit\nEt chante seul, à demi-voix.';
const FAKE = `
  window.__TIMING = { stall: 400, step: 300, end: 150, deaf: 3000, readBase: 50, readWord: 0, readMin: 100, readMax: 200 };
  window.__recs = [];
  class FakeRec {
    constructor() { window.__rec = this; window.__recs.push(this); this.results = []; }
    start() { setTimeout(() => { this.onstart && this.onstart(); this.onaudiostart && this.onaudiostart(); }, 10); }
    stop() { setTimeout(() => this.onend && this.onend(), 10); }
  }
  window.webkitSpeechRecognition = FakeRec;
  window.SpeechRecognition = FakeRec;
  try { Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true }); } catch (e) {}
  window.__say = (text, final = true) => {
    const r = window.__rec; const item = [{ transcript: text }]; item.isFinal = final;
    if (r.results.length && !r.results[r.results.length - 1].isFinal) r.results.pop();
    r.results.push(item);
    r.onresult && r.onresult({ results: r.results });
  };
  window.__end = () => { const r = window.__rec; r.onend && r.onend(); };
`;
const plain = (l) => l.replace(/[«»:;!?.,…]/g, ' ').replace(/\s+/g, ' ').trim();
const FORBIDDEN = ['marches', 'lampe', 'GASPARD', 'Gaspard', 'INSPECTRICE', 'brume', 'Cent douze', 'phare', 'mouettes'];

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://localhost:${srv.address().port}`;
  const url = `${base}/repetition/`;
  const browser = await chromium.launch();
  const out = [];
  const check = (c, m) => out.push((c ? 'OK   ' : 'ÉCHEC ') + m);

  // Le faux PDF : noms seuls sur une ligne, répliques coupées en plusieurs lignes (colonne étroite).
  {
    const p = await browser.newPage();
    await p.setContent(`<html><body style="font: 15px serif; width: 300px; margin: 40px">${'<p>CENT DOUZE MARCHES</p>' + PAIRS.map(([s, l]) => `<p style="margin:14px 0 2px">L’INSPECTRICE</p><p style="margin:0">${esc(s)}</p><p style="margin:14px 0 2px">GASPARD</p><p style="margin:0">${esc(l)}</p>`).join('')}</body></html>`);
    await p.pdf({ path: PDF, format: 'A5' });
    await p.close();
  }

  let firstCtx = true;
  for (const [scheme, width, height] of [['light', 390, 844], ['dark', 390, 844], ['light', 1280, 900]]) {
    const tag = `[${scheme} ${width}]`;
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
    await ctx.addInitScript(FAKE);
    const page = await ctx.newPage();
    const errors = [], requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', (d) => d.accept());
    page.on('request', (r) => requests.push(r));
    await page.goto(url);
    const text = (s) => page.$eval(s, (n) => n.textContent);
    const say = (t, f = true) => page.evaluate(([a, b]) => window.__say(a, b), [t, f]);
    const count = (sel) => page.$$eval(sel, (n) => n.length);
    const wordClass = (w) => page.$$eval('#line .w', (ns, x) => (ns.find((n) => n.textContent.replace(/[\s.,:;!?«»…]/g, '') === x) || {}).className || '', w);
    const waitLine = (k) => page.waitForFunction((x) => document.querySelector('#se-progress').textContent.startsWith(x + ' /'), k);
    const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

    if (firstCtx) {
      // Outils de mots
      const u = await page.evaluate(() => ({
        n112: frNumber(112), n80: frNumber(80), n71: frNumber(71), n1784: frNumber(1784), n30: frNumber(30), n200: frNumber(200),
        rev: sound('reverrai') === sound('reverrez'), chg: sound('changer') !== sound('changera'), mar: sound('marche') === sound('marches'),
        pet: sound('petit') !== sound('petite'), sa: sound('ça') === sound('sa'), ces: sound('ces') === sound('ses'),
        dem: sound('demande') !== sound('demander'),
      }));
      check(u.n112 === 'cent douze' && u.n80 === 'quatre-vingts' && u.n71 === 'soixante et onze' && u.n1784 === 'mille sept cent quatre-vingt-quatre' && u.n30 === 'trente' && u.n200 === 'deux cents',
        `${tag} nombres en lettres : 112 → « ${u.n112} », 80 → « ${u.n80} », 71 → « ${u.n71} », 1784 → « ${u.n1784} »`);
      check(u.rev && u.mar && u.sa && u.ces, `${tag} même son : reverrai/reverrez, marche/marches, ça/sa, ces/ses`);
      check(u.chg && u.pet && u.dem, `${tag} sons différents : changer/changera, petit/petite, demande/demander`);
    }

    check((await text('#list')).includes('Aucun texte'), `${tag} bibliothèque vide au départ`);
    if (width !== 1280 || true) await page.screenshot({ path: `${shots}/${scheme}-${width}-1-accueil.png` });

    // ---------- Séance avec la scène d'exemple ----------
    await page.click('#example');
    check((await count('#se-from option')) === 8, `${tag} scène d’exemple : 8 répliques à dire`);
    check((await page.getAttribute('#mode-coeur', 'aria-pressed')) === 'true', `${tag} mode « par cœur » par défaut`);
    await page.click('#go');
    await waitLine(1);
    await page.waitForFunction(() => window.__recs.length === 1 && document.querySelector('#cue').textContent.includes('INSPECTRICE'));
    check((await count('#line .w.mask')) === (await count('#line .w')) && (await count('#line .w')) > 10, `${tag} réplique cachée, signal affiché`);
    check((await page.evaluate(() => navigator.audioSession.type)) === 'play-and-record', `${tag} réglage « lecture et micro » posé au début`);
    // Réplique 1 : nombres dits en chiffres par la reconnaissance
    await say('Où voulez-vous que je sois depuis 30 ans je monte ces 112 marches deux fois par jour');
    await waitLine(2);
    check(true, `${tag} réplique 1 suivie (« 30 », « 112 » reconnus en chiffres), signal suivant enchaîné sans toucher`);
    // Réplique 2 : blocage sur « lampe », trois aides
    await say('Une lettre posez-la sur la table à côté de la');
    await page.waitForFunction(() => document.querySelector('#bubble').textContent === '«\u00a0l…\u00a0»');
    if (width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-2-seance-souffle.png` });
    await page.waitForFunction(() => document.querySelector('#bubble').textContent === '«\u00a0lam…\u00a0»');
    await page.waitForFunction(() => document.querySelector('#bubble').textContent === '«\u00a0lampe\u00a0»');
    check(true, `${tag} souffleur à l’écran : « l… », puis « lam… », puis « lampe »`);
    check((await wordClass('lampe')).includes('todo'), `${tag} mot soufflé en entier : visible dans la réplique`);
    await say('lampe je la lirai quand la nuit sera tombée');
    await page.waitForFunction(() => document.querySelector('#status').textContent === '✓' || document.querySelector('#se-progress').textContent.startsWith('3'));
    check((await wordClass('lampe')).includes('hint'), `${tag} « lampe » marqué soufflé (bleu)`);
    await waitLine(3);
    // Réplique 3 : la reconnaissance redonne tout le texte dans un nouveau résultat (doublon)
    await say('Tout ce qui arrive ici');
    await page.evaluate(() => { const r = window.__rec; const it = [{ transcript: 'Tout ce qui arrive ici me concerne directement mademoiselle le vent les bateaux les mouettes et maintenant vous' }]; it.isFinal = true; r.results.push(it); r.onresult({ results: r.results }); });
    await waitLine(4);
    check(true, `${tag} réplique 3 : résultat en double de la reconnaissance absorbé`);
    // Réplique 4 : l'iPhone coupe l'écoute au milieu ; relance seule
    await say('Plus besoin de monter vous croyez');
    await page.evaluate(() => window.__end());
    await page.waitForFunction(() => window.__recs.length === 2);
    await page.waitForTimeout(40);
    await say('qu’on monte cent douze marches parce qu’on en a besoin');
    await waitLine(5);
    check(true, `${tag} réplique 4 : coupure de l’écoute, relance automatique sans perdre la place`);
    // Réplique 5 : mot approché (« regardera » pour « regarderai ») ; « demanderait » a le même son que « demanderai »
    await say('Je regardera la lumière depuis la côte comme tout le monde et je me demanderait qui veille sur elle');
    await page.waitForFunction(() => document.querySelector('#status').textContent === '✓');
    check((await wordClass('regarderai')).includes('approx') && (await wordClass('demanderai')).includes('done'), `${tag} « regardera » marqué approché (violet), « demanderait » accepté (même son)`);
    await waitLine(6);
    // Réplique 6 : « n’ » avalé
    await say('Une machine ne sait pas qu’il y a de la brume avant qu’elle arrive moi je la sens dans mes genoux deux jours avant les marins');
    await page.waitForFunction(() => document.querySelector('#status').textContent === '✓');
    check((await wordClass('n’')).includes('skip'), `${tag} « n’ » avalé : marqué sauté (orange), la réplique continue`);
    await waitLine(7);
    // Réplique 7 : passée d'un toucher
    await page.click('#skip');
    await waitLine(8);
    await say('À vous non vous avez monté les 112 marches ça mérite au moins une tasse');
    await page.waitForSelector('#se-end:not([hidden])');
    const endT = await text('#se-end');
    check(endT.includes('Scène terminée') && endT.includes('8 répliques sur 8') && endT.includes('1 mot soufflé') && endT.includes('1 mot sauté') && endT.includes('1 mot approché'),
      `${tag} fin de scène : ${(await text('#end-sum'))}`);
    check(endT.includes('soufflé : lampe') && endT.includes('«\u00a0regardera\u00a0» pour «\u00a0regarderai\u00a0»') && endT.includes('sauté : n’'), `${tag} bilan : mots à reprendre listés, réplique par réplique`);
    check((await page.evaluate(() => navigator.audioSession.type)) === 'auto', `${tag} réglage son remis à « auto » à la fin`);
    await page.click('#beeps button:nth-child(2)');
    await page.click('#copy');
    const rep = await text('#report');
    if (process.env.SHOW_REPORT) console.log(rep);
    check(rep.includes('ouverte 2 fois') && rep.includes('1 relance') && rep.includes('Bips entendus, selon toi : un au début') && rep.includes('passée au toucher') && /doublons repérés [1-9]/.test(rep),
      `${tag} rapport technique : ouvertures, relance, bips, réplique passée, doublon`);
    const leak = FORBIDDEN.filter((w) => rep.includes(w));
    check(!leak.length, `${tag} rapport sans aucun mot du texte, du titre ni des personnages${leak.length ? ' — trouvé : ' + leak.join(', ') : ''}`);
    await page.screenshot({ path: `${shots}/${scheme}-${width}-3-fin.png`, fullPage: true });
    check(await noScroll(), `${tag} pas de défilement horizontal (fin de séance)`);

    // ---------- Mémoire : rechargement ----------
    await page.reload();
    check((await text('#list')).includes('Cent douze marches') && (await text('#list')).includes('dernière séance'), `${tag} après rechargement : texte et dernière séance gardés`);

    // ---------- Silence : pause, puis « Je continue » ----------
    await page.click('.text-card');
    await page.selectOption('#se-from', '7');
    await page.click('#mode-voir');
    await page.click('#go');
    await waitLine(8);
    check((await count('#line .w.mask')) === 0 && (await count('#line .w.todo')) > 5, `${tag} mode « texte visible » : réplique lisible`);
    await page.waitForSelector('#resume:not([hidden])', { timeout: 8000 });
    check((await text('#status')).includes('n’entends plus rien'), `${tag} 3 s de silence (raccourci pour le test) : pause et bouton « Je continue »`);
    const n0 = await page.evaluate(() => window.__recs.length);
    await page.click('#resume');
    await page.waitForFunction((n) => window.__recs.length === n + 1, n0);
    await page.waitForTimeout(40);
    await say('À vous non vous avez monté les cent douze marches ça mérite au moins une tasse');
    await page.waitForSelector('#se-end:not([hidden])');
    check((await text('#end-sum')).startsWith('1 réplique sur 1'), `${tag} reprise au toucher, réplique finie`);

    // ---------- Ajout de textes ----------
    await page.click('#se-back');
    await page.click('#add');
    await page.fill('#ed-text', POEM);
    await page.click('#ed-parse');
    check((await text('#ed-summary')).includes('Pas de personnages') && (await text('#ed-summary')).includes('2 morceaux'), `${tag} poésie collée : ${await text('#ed-summary')}`);
    await page.fill('#ed-title', 'Poésie inventée');
    await page.click('#ed-save');
    check((await count('#se-from option')) === 2 && (await text('#se-title')) === 'Poésie inventée', `${tag} poésie enregistrée : 2 morceaux à dire`);
    await page.click('#se-back');

    for (const [file, label] of [[TXT, 'fichier texte'], [DOCX, 'Word'], [PDF, 'PDF']]) {
      await page.click('#add');
      await page.setInputFiles('#file', file);
      await page.waitForFunction(() => /Texte lu|n’arrive pas/.test(document.querySelector('#file-status').textContent), null, { timeout: 15000 });
      const sum = await text('#ed-summary');
      const cast = await page.$$eval('#ed-cast label', (ns) => ns.map((n) => n.textContent));
      const ok = sum.startsWith('2 personnages') && cast.some((c) => c.startsWith('GASPARD') && c.includes('8 répliques')) && cast.some((c) => c.startsWith('L’INSPECTRICE') && c.includes('8 répliques'));
      check(ok, `${tag} ${label} : ${sum} ${cast.join(' ; ')}`);
      if (label === 'Word' && width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-4-ajout-word.png`, fullPage: true });
      await page.check('#ed-cast input[value="GASPARD"]');
      await page.click('#ed-save');
      await page.waitForSelector('#session:not([hidden])');
      const lines = await page.evaluate(() => ex.map((e) => e.line));
      const want = PAIRS.map(([, l]) => l);
      const same = lines.length === 8 && lines.every((l, i) => l.replace(/\s+/g, ' ') === want[i]);
      check(same, `${tag} ${label} : les 8 répliques du rôle lues mot pour mot${same ? '' : ' — ' + JSON.stringify(lines.slice(0, 3))}`);
      if (label === 'Word') {
        const d = await page.evaluate(() => [ex[2].didas, ex[2].cue.length]);
        check(d[0].includes('sans se retourner') && d[0].includes('Il se lève.'), `${tag} Word : didascalies écartées de la réplique et affichées à part (« ${d[0]} »)`);
      }
      await page.click('#se-back');
    }
    check((await count('.text-card')) === 5, `${tag} bibliothèque : 5 textes`);

    // ---------- Effacer ----------
    await page.click('.text-card');
    await page.click('#se-delete');
    check((await count('.text-card')) === 4, `${tag} texte effacé de la mémoire`);
    if (width === 1280) await page.screenshot({ path: `${shots}/${scheme}-${width}-5-bibliotheque.png` });

    // ---------- Réseau : rien d'autre que la page elle-même ----------
    const foreign = requests.filter((r) => !r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:'));
    const posts = requests.filter((r) => r.method() !== 'GET');
    check(!foreign.length && !posts.length, `${tag} réseau : ${requests.length} requêtes, toutes vers le site lui-même et en lecture seule${foreign.length ? ' — ' + foreign.map((r) => r.url()).join(', ') : ''}`);
    check(await noScroll(), `${tag} pas de défilement horizontal`);
    check(!errors.length, `${tag} aucune erreur dans la console${errors.length ? ' — ' + errors.join(' | ') : ''}`);
    await ctx.close();
    firstCtx = false;
  }
  await browser.close();
  srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(out.join('\n'));
  const bad = out.filter((l) => l.startsWith('ÉCHEC')).length;
  console.log(`\n${out.length - bad} OK, ${bad} échec(s)`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
