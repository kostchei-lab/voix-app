// Test de la page souffleur-test/ (test v4 : page neuve à chaque essai, M et M′), avec une reconnaissance
// et un réglage « lecture et micro » simulés ; les fichiers son sont réellement décodés et joués par Chromium
// (lecteur de la page pour M, lecteur ordinaire pour M′).
// Usage : node tests/e2e-souffleur-test.cjs <racine servie (contient souffleur-test/ et icons/)> <dossier-captures>
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const [root, shots] = process.argv.slice(2);
const ROOT = path.resolve(root);
fs.mkdirSync(shots, { recursive: true });
const TYPES = { '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// Reconnaissance simulée : window.__say(texte, final) ; window.__ready = délais (ms) avant « micro prêt »
// pour les prochaines écoutes (500 ms sinon). abort() donne l'erreur « aborted » puis la fin, comme Safari.
const FAKE = `
  window.__recStarts = []; window.__ready = []; window.__plays = 0; window.__elPlays = 0; window.__elGesture = [];
  class FakeRec {
    constructor() { window.__rec = this; this.results = []; }
    start() {
      window.__recStarts.push(performance.now());
      const d = window.__ready.length ? window.__ready.shift() : 500;
      setTimeout(() => this.onstart && this.onstart(), 5);
      setTimeout(() => this.onaudiostart && this.onaudiostart(), d);
    }
    stop() { setTimeout(() => this.onend && this.onend(), 10); }
    abort() { setTimeout(() => { this.onerror && this.onerror({ error: 'aborted' }); this.onend && this.onend(); }, 10); }
  }
  window.webkitSpeechRecognition = FakeRec;
  window.SpeechRecognition = FakeRec;
  window.__say = (text, final) => {
    const r = window.__rec; const item = [{ transcript: text }]; item.isFinal = !!final;
    if (r.results.length && !r.results[r.results.length - 1].isFinal) r.results.pop();
    r.results.push(item);
    r.onresult && r.onresult({ results: r.results });
  };
  window.__modes = [];
  const sess = { _t: 'auto', state: 'inactive', onstatechange: null };
  Object.defineProperty(sess, 'type', { get() { return this._t; }, set(v) { this._t = v; window.__modes.push(v); } });
  Object.defineProperty(Navigator.prototype, 'audioSession', { get() { return sess; }, configurable: true });
  const st = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    window.__plays++;
    this.addEventListener('ended', () => { window.__playEnd = performance.now(); });
    return st.apply(this, a);
  };
  const pl = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    window.__elPlays++;
    window.__elGesture.push(navigator.userActivation ? navigator.userActivation.isActive : null);
    if (!this.__spy) { this.__spy = true; this.addEventListener('ended', () => { window.__playEnd = performance.now(); }); }
    return pl.apply(this, a);
  };
`;
const L = [
  'Je ne suis pas venu ici pour me taire mais pour vous dire enfin ce que je pense',
  "Vous m'avez trompé et tout le monde le savait sauf moi",
  "Je ne vous demande rien seulement de m'écouter jusqu'au bout",
  'Je partirai demain matin et vous ne me reverrez plus',
];

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://localhost:${srv.address().port}/souffleur-test/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
  const out = [];
  const check = (c, m) => out.push((c ? 'OK   ' : 'ÉCHEC ') + m);
  for (const [scheme, width, height, full] of [['light', 390, 844, true], ['dark', 390, 844, false], ['light', 1280, 900, false]]) {
    const tag = `[${scheme} ${width}]`;
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.addInitScript(FAKE);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);
    const text = (s) => page.$eval(s, (n) => n.textContent);
    const report = () => text('#report');
    const waitLog = (s, timeout = 15000) => page.waitForFunction((x) => document.querySelector('#report').textContent.includes(x), s, { timeout });
    const say = (t, f = true) => page.evaluate(([a, b]) => window.__say(a, b), [t, f]);
    const ready = (arr) => page.evaluate((a) => { window.__ready = a; }, arr);
    const gap = () => page.evaluate(() => window.__recStarts[window.__recStarts.length - 1] - window.__playEnd);
    // Joue une réplique entière : attend que le micro soit prêt, puis la dit.
    const turn = async (name, k) => { await waitLog(`${name}${k} micro prêt :`); await say(L[k - 1]); await waitLog(`${name}${k} fin de réplique`); };
    const answer = async (route, side, perm) => {
      await page.click(`#ask [data-q=route] [data-a="${route}"]`);
      check(await page.isHidden('#fresh'), `${tag} « Recommencer » attend les trois réponses`);
      await page.click(`#ask [data-q=side] [data-a="${side}"]`);
      await page.click(`#ask [data-q=perm] [data-a="${perm}"]`);
    };

    check((await text('#stepTitle')).startsWith('Essai 1 sur 4 : M,'), `${tag} commence par l’essai 1, M`);
    check((await text('#status')).includes('n° 1, ouverte') && await page.isHidden('#fresh') && await page.isEnabled('#go'), `${tag} page n° 1, Lancer actif`);
    if (width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-accueil.png`, fullPage: true });

    // ---- Essai 1, M : lecteur de la page, son relevé ; première écoute « prête trop vite » puis rouverte
    if (full) await ready([50, 600]);
    await page.click('#go');
    check(await page.isDisabled('#go') && await page.isEnabled('#stop'), `${tag} M Lancer bloqué pendant l’essai`);
    await waitLog('M partenaire 1 : lecture finie (lue)');
    await waitLog('M1 écoute démarrée');
    const g1 = await gap();
    check(g1 >= 390 && g1 < 900, `${tag} M 1re écoute ${Math.round(g1)} ms après la fin de la voix, sans toucher`);
    if (full) {
      await waitLog('M1 micro prêt trop vite : 0,05 s : écoute fermée et rouverte (n° 1)');
      await waitLog('M1 micro prêt : 0,60 s après la demande (après 1 réouverture)');
      check(true, `${tag} M écoute prête en 0,05 s : fermée et rouverte, puis prête en 0,60 s`);
      await say('je ne suis pas venu');
      await page.waitForTimeout(2900);
      const h1 = await text('#prompt');
      check(h1.includes('« i…'), `${tag} M souffleur après 2,5 s de blanc : ${h1}`);
      await say(L[0].replace('je ne suis pas venu', 'Je ne suis pas venu'));
      await waitLog('M1 fin de réplique : 18/18');
      if (width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-en-cours.png` });
    } else await turn('M', 1);
    await turn('M', 2);
    if (full) {
      // Mot élidé : le souffleur donne « m’é… » et pas « m… »
      await waitLog('M3 micro prêt :');
      await say('je ne vous demande rien seulement de');
      await page.waitForTimeout(2900);
      const h3 = await text('#prompt');
      check(h3.includes('« m’é…'), `${tag} M souffle d’un mot élidé : ${h3}`);
      await say(L[2]);
      await waitLog('M3 fin de réplique');
    } else await turn('M', 3);
    await turn('M', 4);
    await waitLog('Essai 1 fini : 4 répliques complètes sur 4');
    check(await page.evaluate(() => window.__plays) === 4, `${tag} M 4 répliques du partenaire jouées par le lecteur de la page`);
    check(await page.isVisible('#ask') && await page.isDisabled('#go') && await page.isHidden('#fresh'), `${tag} M questions, Lancer bloqué, pas encore « Recommencer »`);
    check((await text('#stepTitle')).startsWith('Essai 1 sur 4 : M,'), `${tag} M le titre reste sur l’essai 1 pendant les questions`);
    if (width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-questions.png`, fullPage: true });
    await answer('fort', 'venant du bas (haut-parleur)', 'non');
    check(await page.isVisible('#fresh') && (await text('#freshWhy')).includes('essai 2 sur 4 (M′)'), `${tag} M « Recommencer à neuf » proposé pour l’essai 2 (M′)`);
    const modes = await page.evaluate(() => window.__modes.slice());
    check(modes.join(' → ') === 'play-and-record → auto', `${tag} M réglage demandé puis remis : ${modes.join(' → ')}`);
    let rep = await report();
    const re1 = full
      ? /Essai 1, M \(page n° 1, ouverte, Safari, réglage play-and-record\) : 4 répliques complètes sur 4 ; réplique 1 : 18\/18 \(complète\), micro prêt 0,05 s \(trop vite, rouverte\) → 0,60 s, geste récent (oui|non),.*réplique 3 : 12\/12.*souffles m’é….*partenaire : 1 lue \/ 2 lue \/ 3 lue \/ 4 lue ; son, selon toi : fort, venant du bas \(haut-parleur\) ; accès au micro demandé : non ; touchers pendant l’essai 0/
      : /Essai 1, M \(page n° 1, ouverte, Safari, réglage play-and-record\) : 4 répliques complètes sur 4 ; réplique 1 : 18\/18 \(complète\), micro prêt 0,50 s,/;
    check(re1.test(rep), `${tag} M essai 1 dans le rapport`);

    // ---- Rechargement : essai 2, M′ (lecteur ordinaire)
    await Promise.all([page.waitForNavigation(), page.click('#fresh')]);
    check((await text('#stepTitle')).startsWith('Essai 2 sur 4 : M′'), `${tag} après rechargement : essai 2, M′`);
    check((await text('#status')).includes('n° 2, rechargée') && (await report()).includes('Essai 1, M (page n° 1'), `${tag} page n° 2 rechargée, rapport gardé`);
    if (full) await ready([10, 10, 10]);
    await page.click('#go');
    check(await page.evaluate(() => window.__elPlays === 1 && window.__elGesture[0] === true), `${tag} M′ 1re réplique lancée par le toucher (lecteur ordinaire)`);
    await waitLog('M′ partenaire 1 : lecture finie (lue)');
    await waitLog('M′1 écoute démarrée');
    if (full) {
      await waitLog('M′1 micro prêt : 0,01 s après la demande (après 2 réouvertures)');
      check(true, `${tag} M′ deux réouvertures au plus, puis l’écoute est gardée`);
      await say(L[0]);
      await waitLog('M′1 fin de réplique');
      // Réplique 2 sans rien dire : abandon après 10 s, la scène continue.
      await waitLog('M′2 fin de réplique : 0/12, rien entendu en 10 s', 16000);
      check(true, `${tag} M′ réplique sans voix abandonnée après 10 s`);
      // Réplique 3 : un toucher pendant l'essai est compté.
      await waitLog('M′3 micro prêt :');
      await page.mouse.click(30, 30);
      await say(L[2]);
      await waitLog('M′3 fin de réplique');
    } else { await turn('M′', 1); await turn('M′', 2); await turn('M′', 3); }
    await turn('M′', 4);
    await waitLog('Essai 2 fini');
    const elPlays = await page.evaluate(() => window.__elPlays);
    check(elPlays === 4 && await page.evaluate(() => window.__plays) === 0, `${tag} M′ 4 répliques jouées par le lecteur ordinaire (${elPlays})`);
    await answer('faiblement', 'venant du haut (comme au téléphone)', 'oui');
    rep = await report();
    const re2 = full
      ? /Essai 2, M′ \(page n° 2, rechargée, Safari, réglage play-and-record\) : 3 répliques complètes sur 4 ; réplique 1 : 18\/18 \(complète\), micro prêt 0,01 s \(trop vite, rouverte\) → 0,01 s \(trop vite, rouverte\) → 0,01 s,.*réplique 2 : 0\/12 \(rien entendu en 10 s\).*son, selon toi : faiblement, venant du haut \(comme au téléphone\) ; accès au micro demandé : oui ; touchers pendant l’essai 1/
      : /Essai 2, M′ \(page n° 2, rechargée, Safari, réglage play-and-record\) : 4 répliques complètes sur 4/;
    check(re2.test(rep), `${tag} M′ essai 2 dans le rapport`);
    if (width === 1280) await page.screenshot({ path: `${shots}/${scheme}-${width}-apres-m-prime.png`, fullPage: true });

    if (full) {
      const syn = rep.split('Essais :')[0];
      check(syn.includes('M (lecteur de la page) : 1 essai ; répliques complètes 4/4 ; ta voix entendue 4/4 ; micro prêt trop vite (< 0,30 s) dans 1 réplique, voix entendue ensuite dans 1 ; son : fort, venant du bas (haut-parleur)'), `${tag} synthèse M`);
      check(syn.includes('M′ (lecteur ordinaire) : 1 essai ; répliques complètes 3/4 ; ta voix entendue 3/4 ; micro prêt trop vite (< 0,30 s) dans 1 réplique, voix entendue ensuite dans 1 ; son : faiblement, venant du haut (comme au téléphone)'), `${tag} synthèse M′`);
      // ---- Essai 3 arrêté : on reste à l'essai 3 après rechargement
      await Promise.all([page.waitForNavigation(), page.click('#fresh')]);
      await page.click('#go');
      await waitLog('M1 micro prêt :');
      await page.click('#stop');
      check((await text('#phase')).startsWith('Arrêté') && await page.isVisible('#fresh') && await page.isHidden('#ask'), `${tag} arrêt : pas de question, « Recommencer à neuf »`);
      check((await report()).includes('touchers pendant l’essai 0'), `${tag} le bouton Arrêter n’est pas compté comme toucher`);
      await Promise.all([page.waitForNavigation(), page.click('#fresh')]);
      check((await text('#stepTitle')).startsWith('Essai 3 sur 4 : M,') && (await text('#status')).includes('n° 4'), `${tag} essai arrêté : on refait l’essai 3 (page n° 4)`);
      // Copie, puis effacement
      await page.click('#copy');
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      check(clip.startsWith('TEST SOUFFLEUR v4') && clip.includes('Essai 2, M′'), `${tag} rapport copié`);
      await page.click('#clear');
      check((await text('#stepTitle')).startsWith('Essai 1 sur 4') && (await report()).includes('(aucun)'), `${tag} « Effacer » repart de l’essai 1`);
    }
    check(errors.length === 0, `${tag} aucune erreur dans la console${errors.length ? ' : ' + errors.join(' | ') : ''}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!overflow, `${tag} pas de défilement horizontal`);
    await ctx.close();
  }
  await browser.close();
  srv.close();
  console.log(out.join('\n'));
  const bad = out.filter((l) => l.startsWith('ÉCHEC')).length;
  console.log(`\n${out.length - bad} OK, ${bad} échec(s)`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
