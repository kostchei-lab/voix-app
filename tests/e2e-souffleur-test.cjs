// Test de la page souffleur-test/ (test v5.1 : appli fermée entre deux essais ; essais A, R, X, P, H, V), avec une
// reconnaissance, un réglage « lecture et micro » et un micro (getUserMedia) simulés ; les fichiers son sont réellement
// décodés et joués par Chromium (lecteur de la page pour M, lecteur ordinaire pour M′). « Fermer l'appli » est simulé
// par un nouvel onglet (mémoire de session neuve), « recharger » par un rechargement, le mode avion par setOffline.
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
// Micro simulé : un son de 220 Hz dont window.__mic(v) règle l'amplitude (0,003 ≈ bruit de salle, 0,3 = voix, 0 = micro muet).
const FAKE = `
  window.__recStarts = []; window.__ready = []; window.__plays = 0; window.__elPlays = 0; window.__elGesture = [];
  class FakeRec {
    constructor() { window.__rec = this; this.results = []; }
    start() {
      window.__recStarts.push(performance.now());
      if (window.__failNet) { setTimeout(() => { this.onerror && this.onerror({ error: 'network' }); this.onend && this.onend(); }, 20); return; }
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
  window.__micLevel = 0.003; window.__gum = 0;
  window.__mic = (v) => { window.__micLevel = v; if (window.__micGain) window.__micGain.gain.value = v; };
  navigator.mediaDevices.getUserMedia = function () {
    window.__gum++;
    const ac = new AudioContext(); ac.resume();
    const o = ac.createOscillator(); o.frequency.value = 220;
    const g = ac.createGain(); g.gain.value = window.__micLevel; window.__micGain = g;
    const d = ac.createMediaStreamDestination();
    o.connect(g); g.connect(d); o.start();
    window.__micStream = d.stream;
    return Promise.resolve(d.stream);
  };
`;
const L = [
  'Je ne suis pas venu ici pour me taire mais pour vous dire enfin ce que je pense',
  "Vous m'avez trompé et tout le monde le savait sauf moi",
  "Je ne vous demande rien seulement de m'écouter jusqu'au bout",
  'Je partirai demain matin et vous ne me reverrez plus',
  'Chez mon frère à la campagne loin de vos mensonges',
  "Je ne regrette qu'une chose de vous avoir cru si longtemps",
  'Non ma décision est prise et rien ne la changera',
  'Adieu et soyez heureux si vous le pouvez',
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
    const errors = [];
    let page = null;
    // « Rouvrir l'appli » : nouvel onglet (mémoire de session neuve, mémoire de la page gardée).
    const reopen = async () => {
      const old = page;
      page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(url);
      if (old) await old.close();
    };
    const reload = () => Promise.all([page.waitForNavigation(), page.click('#reload')]);
    await reopen();
    const text = (s) => page.$eval(s, (n) => n.textContent);
    const report = () => text('#report');
    // En cas d'échec, la fin du journal de la page est affichée.
    const waitLog = (s, timeout = 15000) => page.waitForFunction((x) => document.querySelector('#report').textContent.includes(x), s, { timeout })
      .catch(async (e) => { console.error(`${tag} attendu « ${s} » ; fin du journal :\n` + (await page.$eval('#report', (n) => n.textContent)).split('Journal :')[1].slice(-1200)); throw e; });
    const say = (t, f = true) => page.evaluate(([a, b]) => window.__say(a, b), [t, f]);
    const ready = (arr) => page.evaluate((a) => { window.__ready = a; }, arr);
    const mic = (v) => page.evaluate((x) => window.__mic(x), v);
    const ev = (f) => page.evaluate(f);
    const gap = () => ev(() => window.__recStarts[window.__recStarts.length - 1] - window.__playEnd);
    const turn = async (name, k) => { await waitLog(`${name}${k} micro prêt :`); await say(L[k - 1]); await waitLog(`${name}${k} fin de réplique`); };
    const answer = async (route, side, perm) => {
      await page.click(`#ask [data-q=route] [data-a="${route}"]`);
      check(await page.isHidden('#next') && await page.isHidden('#reload'), `${tag} la consigne suivante attend les trois réponses`);
      await page.click(`#ask [data-q=side] [data-a="${side}"]`);
      await page.click(`#ask [data-q=perm] [data-a="${perm}"]`);
    };

    check((await text('#stepTitle')) === 'Essai 1 sur 6 : A, M, appli rouverte, 8 échanges', `${tag} commence par l’essai 1, A`);
    check((await text('#status')).includes('n° 1, appli rouverte') && await page.isHidden('#condWarn') && await page.isHidden('#reload') && await page.isEnabled('#go'), `${tag} page n° 1 vue comme appli rouverte, pas d’avertissement, Lancer actif`);
    check((await page.$$('#track div')).length === 6, `${tag} six essais affichés`);
    if (width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-accueil.png`, fullPage: true });

    // ---- Essai 1, A : M sur 8 échanges ; écoute prête en 0,01 s gardée telle quelle (plus de réouverture)
    await ready([10]);
    await page.click('#go');
    check(await page.isDisabled('#go') && await page.isEnabled('#stop'), `${tag} A Lancer bloqué pendant l’essai`);
    await waitLog('A partenaire 1 : lecture finie (lue)');
    await waitLog('A1 écoute démarrée');
    const g1 = await gap();
    check(g1 >= 390 && g1 < 900, `${tag} A 1re écoute ${Math.round(g1)} ms après la fin de la voix, sans toucher`);
    await waitLog('A1 micro prêt : 0,01 s après la demande');
    check(!/trop vite|écoute rouverte|pour réouverture/.test(await report()), `${tag} A écoute prête en 0,01 s gardée, sans réouverture`);
    if (full) {
      await say('je ne suis pas venu');
      await page.waitForTimeout(2900);
      const h1 = await text('#prompt');
      check(h1.includes('« i…'), `${tag} A souffleur après 2,5 s de blanc : ${h1}`);
      await say(L[0].replace('je ne suis pas venu', 'Je ne suis pas venu'));
      await waitLog('A1 fin de réplique : 18/18');
      if (width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-en-cours.png` });
      await turn('A', 2);
      await waitLog('A3 micro prêt :');
      await say('je ne vous demande rien seulement de');
      await page.waitForTimeout(2900);
      const h3 = await text('#prompt');
      check(h3.includes('« m’é…'), `${tag} A souffle d’un mot élidé : ${h3}`);
      await say(L[2]);
      await waitLog('A3 fin de réplique');
    } else { await say(L[0]); await waitLog('A1 fin de réplique'); await turn('A', 2); await turn('A', 3); }
    for (let k = 4; k <= 8; k++) await turn('A', k);
    await waitLog('Essai 1 fini : 8 répliques complètes sur 8');
    check(await ev(() => window.__plays) === 8, `${tag} A 8 répliques du partenaire jouées par le lecteur de la page`);
    check(await page.isVisible('#ask') && await page.isDisabled('#go') && (await text('#stepTitle')).startsWith('Essai 1 sur 6 : A'), `${tag} A questions, Lancer bloqué, titre sur l’essai 1`);
    if (width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-questions.png`, fullPage: true });
    await answer('fort', 'venant du bas (haut-parleur)', 'non');
    check(await page.isVisible('#next') && (await text('#next')).includes('Essai 2 : M, page rechargée') && (await text('#next')).includes('Recharger la page') && await page.isVisible('#reload'), `${tag} A consigne : recharger la page pour l’essai 2 (R)`);
    if (width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-consigne.png`, fullPage: true });
    const modes = await ev(() => window.__modes.slice());
    check(modes.join(' → ') === 'play-and-record → auto', `${tag} A réglage demandé puis remis : ${modes.join(' → ')}`);
    let rep = await report();
    const re1 = full
      ? /Essai 1, A M, appli rouverte, 8 échanges \(page n° 1, appli rouverte, Safari, réglage play-and-record\) : 8 répliques complètes sur 8 ; réplique 1 : 18\/18 \(complète\), micro prêt 0,01 s, geste récent (oui|non),.*réplique 3 : 12\/12.*souffles m’é….*réplique 5 : 10\/10.*réplique 6 : 12\/12.*réplique 8 : 8\/8.*partenaire : 1 lue \/ 2 lue \/ 3 lue \/ 4 lue \/ 5 lue \/ 6 lue \/ 7 lue \/ 8 lue ; son, selon toi : fort, venant du bas \(haut-parleur\) ; accès au micro demandé : non ; touchers pendant l’essai 0/
      : /Essai 1, A M, appli rouverte, 8 échanges \(page n° 1, appli rouverte, Safari, réglage play-and-record\) : 8 répliques complètes sur 8/;
    check(re1.test(rep), `${tag} A essai 1 dans le rapport`);
    if (width === 1280) await page.screenshot({ path: `${shots}/${scheme}-${width}-apres-a.png`, fullPage: true });

    if (full) {
      // ---- Essai 2, R : page rechargée ; une réplique sans voix, un toucher compté
      await reload();
      check((await text('#stepTitle')).startsWith('Essai 2 sur 6 : R') && (await text('#status')).includes('n° 2, page rechargée') && await page.isHidden('#condWarn'), `${tag} R page n° 2 rechargée, condition respectée`);
      check((await report()).includes('Essai 1, A M'), `${tag} R rapport gardé après rechargement`);
      await page.click('#go');
      await turn('R', 1);
      await waitLog('R2 fin de réplique : 0/12, rien entendu en 10 s', 16000);
      check(true, `${tag} R réplique sans voix abandonnée après 10 s`);
      await waitLog('R3 micro prêt :');
      await page.mouse.click(30, 30);
      await say(L[2]);
      await waitLog('R3 fin de réplique');
      await turn('R', 4);
      await waitLog('Essai 2 fini : 3 répliques complètes sur 4');
      await answer('faiblement', 'venant du haut (comme au téléphone)', 'oui');
      check((await text('#next')).includes('Essai 3 : M′ puis M, appli rouverte') && (await text('#next')).includes('Ferme l’appli'), `${tag} R consigne : fermer l’appli pour l’essai 3 (X)`);
      check(/Essai 2, R M, page rechargée \(page n° 2, page rechargée, Safari, réglage play-and-record\) : 3 répliques complètes sur 4 ;.*réplique 2 : 0\/12 \(rien entendu en 10 s\).*touchers pendant l’essai 1/.test(await report()), `${tag} R essai 2 dans le rapport`);

      // ---- Rechargée au lieu de fermée : avertissement
      await reload();
      check(await page.isVisible('#condWarn') && (await text('#condWarn')).includes('appli fermée puis rouverte') && await page.isVisible('#next'), `${tag} X rechargée au lieu de rouverte : avertissement et consigne`);

      // ---- Essai 3, X : appli rouverte ; M′ deux fois (1re dans le toucher), puis M deux fois
      await reopen();
      check((await text('#stepTitle')).startsWith('Essai 3 sur 6 : X') && (await text('#status')).includes('n° 4, appli rouverte') && await page.isHidden('#condWarn'), `${tag} X page n° 4, appli rouverte, pas d’avertissement`);
      await page.click('#go');
      check(await ev(() => window.__elPlays === 1 && window.__elGesture[0] === true), `${tag} X 1re réplique lancée par le toucher (lecteur ordinaire)`);
      for (let k = 1; k <= 4; k++) await turn('X', k);
      await waitLog('Essai 3 fini : 4 répliques complètes sur 4');
      const pl = await ev(() => [window.__elPlays, window.__plays]);
      check(pl[0] === 2 && pl[1] === 2, `${tag} X 2 répliques au lecteur ordinaire, 2 au lecteur de la page (${pl.join(', ')})`);
      await answer('faiblement', 'venant du haut (comme au téléphone)', 'non');
      check(/Essai 3, X M′ puis M, appli rouverte \(page n° 4, appli rouverte.*réplique 1 \(M′\) : 18\/18.*réplique 2 \(M′\) : 12\/12.*réplique 3 \(M\) : 12\/12.*partenaire : 1 \(ordinaire\) lue \/ 2 \(ordinaire\) lue \/ 3 lue \/ 4 lue/.test(await report()), `${tag} X essai 3 dans le rapport`);

      // ---- Essai 4, P : micro de la page seul, niveau mesuré ; voix, rien, micro muet, voix
      await reopen();
      check((await text('#stepTitle')).startsWith('Essai 4 sur 6 : P') && (await text('#status')).includes('n° 5, appli rouverte'), `${tag} P page n° 5, appli rouverte`);
      await page.click('#go');
      await waitLog('P micro de la page : ouvert en');
      await waitLog('P1 ton tour');
      check(await ev(() => window.__gum) === 1 && await page.isVisible('#meter'), `${tag} P micro ouvert une seule fois au toucher, jauge visible`);
      await page.waitForTimeout(500);
      await mic(0.3);
      await page.waitForTimeout(600);
      await waitLog('P1 voix repérée');
      if (width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-micro-page.png` });
      await page.waitForTimeout(600);
      await mic(0.003);
      await waitLog('P1 fin de réplique : fin de parole repérée');
      await waitLog('P2 fin de réplique : rien repéré en 10 s', 16000);
      await mic(0);
      await waitLog('P3 fin de réplique : rien repéré en 10 s', 16000);
      const p3 = (await report()).split('\n').find((l) => l.includes('P3 ton tour')) || '';
      const z3 = +((p3.match(/silence numérique (\d+) %/) || [])[1] || 0);
      check(z3 >= 90, `${tag} P micro muet pendant le partenaire : silence numérique ${z3} %`);
      check(true, `${tag} P micro muet : silence numérique repéré pendant le partenaire et pendant la réplique`);
      await mic(0.003);
      await waitLog('P4 ton tour');
      await page.waitForTimeout(500);
      await mic(0.3);
      await page.waitForTimeout(1000);
      await mic(0.003);
      await waitLog('P4 fin de réplique : fin de parole repérée');
      await waitLog('Essai 4 fini : voix repérée dans 2 répliques sur 4');
      check(await ev(() => window.__plays) === 4 && await ev(() => window.__micStream.getTracks().every((t) => t.readyState === 'ended')), `${tag} P 4 répliques du partenaire, micro de la page refermé à la fin`);
      await answer('assez fort, ça va', 'venant du bas (haut-parleur)', 'oui');
      rep = await report();
      check(/Essai 4, P micro de la page seul, appli rouverte \(page n° 5, appli rouverte, Safari, réglage play-and-record, micro de la page ouvert en [0-9,]+ s[^)]*\) : voix repérée dans 2 répliques sur 4 ; réplique 1 : fin de parole repérée, voix repérée [0-9,]+ s après l’ouverture, parole [0-9,]+ s, niveaux : fond -5\d dB, maximum -1\d dB, silence numérique 0 %, pendant la voix du partenaire : maximum -5\d dB, silence numérique 0 %, courbe \(max par 0,5 s\) [-0-9 ]+.*réplique 3 : rien repéré en 10 s, voix jamais repérée, niveaux : fond —, maximum silence numérique, silence numérique 100 %/.test(rep), `${tag} P essai 4 dans le rapport`);
      check((await text('#next')).includes('Essai 5 : M avec écouteurs') && (await text('#next')).includes('Facultatif'), `${tag} P consigne : essai 5 facultatif, avec écouteurs`);

      // ---- Essai 5, H : écouteurs
      await reopen();
      await page.click('#go');
      for (let k = 1; k <= 4; k++) await turn('H', k);
      await waitLog('Essai 5 fini : 4 répliques complètes sur 4');
      await answer('fort', 'dans les écouteurs', 'non');
      check((await text('#next')).includes('Essai 6 : M en mode avion') && (await text('#next')).includes('mode avion') && await page.isVisible('#skip'), `${tag} H consigne : essai 6 facultatif, en mode avion, bouton Passer`);

      // ---- Essai 6, V : mode avion ; mots reconnus sans connexion
      await reopen();
      check((await text('#stepTitle')).startsWith('Essai 6 sur 6 : V') && await page.isVisible('#netWarn') && (await text('#status')).includes('en ligne'), `${tag} V page connectée : avertissement « mode avion »`);
      await ctx.setOffline(true);
      await page.waitForTimeout(100);
      check(await page.isHidden('#netWarn') && (await text('#status')).includes('hors ligne') && await page.isEnabled('#go'), `${tag} V hors ligne : avertissement retiré, Lancer actif`);
      await page.click('#go');
      check(await page.isHidden('#skip'), `${tag} V pas de « Passer » pendant l’essai`);
      for (let k = 1; k <= 2; k++) await turn('V', k);
      await waitLog('Essai 6 fini : 2 répliques complètes sur 2');
      check(await page.isVisible('#verdict') && (await text('#verdict')).includes('mots reconnus sans connexion'), `${tag} V conclusion affichée : ${await text('#verdict')}`);
      if (width === 390) await page.screenshot({ path: `${shots}/${scheme}-${width}-mode-avion.png`, fullPage: true });
      await answer('fort', 'venant du bas (haut-parleur)', 'non');
      check((await text('#next')).includes('Série finie') && await page.isHidden('#skip'), `${tag} V série finie`);
      check(/Essai 6, V M en mode avion, appli rouverte \(page n° 7, appli rouverte, Safari, réglage play-and-record, connexion au lancement : hors ligne, à la fin : hors ligne\) : 2 répliques complètes sur 2 ; conclusion : mots reconnus sans connexion/.test(await report()), `${tag} V essai 6 dans le rapport`);
      await ctx.setOffline(false);
      const syn = (await report()).split('Essais :')[0];
      const want = [
        '1. A M, appli rouverte, 8 échanges (appli rouverte) : ta voix entendue 8/8 [M 18/18, M 12/12, M 12/12, M 10/10, M 10/10, M 12/12, M 10/10, M 8/8] ; son : fort, venant du bas (haut-parleur)',
        '2. R M, page rechargée (page rechargée) : ta voix entendue 3/4 [M 18/18, M 0/12, M 12/12, M 10/10] ; son : faiblement, venant du haut (comme au téléphone)',
        '3. X M′ puis M, appli rouverte (appli rouverte) : ta voix entendue 4/4 [M′ 18/18, M′ 12/12, M 12/12, M 10/10]',
        '4. P micro de la page seul, appli rouverte (appli rouverte) : ta voix repérée 2/4 [oui, non, non, oui] ; son : assez fort, ça va',
        '5. H M avec écouteurs, appli rouverte (appli rouverte) : ta voix entendue 4/4 [M 18/18, M 12/12, M 12/12, M 10/10] ; son : fort, dans les écouteurs',
        '6. V M en mode avion, appli rouverte (appli rouverte) : ta voix entendue 2/2 [M 18/18, M 12/12] ; son : fort, venant du bas (haut-parleur) ; mots reconnus sans connexion : ton iPhone fait la reconnaissance sur place',
      ];
      const miss = want.filter((w) => !syn.includes(w));
      check(!miss.length, `${tag} synthèse des six essais${miss.length ? ' — manque : ' + miss.join(' | ') : ''}`);

      // ---- Essai en plus arrêté
      await reload();
      check((await text('#stepTitle')).startsWith('Essai en plus (7) : A'), `${tag} après la série : essai en plus (A)`);
      await page.click('#go');
      await page.waitForTimeout(800);
      await page.click('#stop');
      check((await text('#phase')).startsWith('Arrêté') && await page.isVisible('#next') && await page.isHidden('#ask'), `${tag} arrêt : pas de question, consigne pour refaire l’essai`);
      check(/Essai 7 \(en plus\), A .*: arrêt par toi ;.*touchers pendant l’essai 0/.test(await report()), `${tag} le bouton Arrêter n’est pas compté comme toucher`);
      await page.click('#copy');
      const clip = await ev(() => navigator.clipboard.readText());
      check(clip.startsWith('TEST SOUFFLEUR v5.1') && clip.includes('Essai 4, P micro'), `${tag} rapport copié`);
      await page.click('#clear');
      check((await text('#stepTitle')).startsWith('Essai 1 sur 6') && (await report()).includes('(aucun)'), `${tag} « Effacer » repart de l’essai 1`);
    } else if (width === 390) {
      // ---- Passer l'essai H, puis V en mode avion avec une reconnaissance qui a besoin du réseau
      await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('souffleur-test-v5')); st.ptr = 4; localStorage.setItem('souffleur-test-v5', JSON.stringify(st)); });
      await reopen();
      check((await text('#stepTitle')).startsWith('Essai 5 sur 6 : H') && await page.isVisible('#skip'), `${tag} H facultatif : bouton « Passer cet essai »`);
      await page.click('#skip');
      const cells = await page.$$eval('#track .res', (n) => n.map((x) => x.textContent));
      check((await text('#stepTitle')).startsWith('Essai 6 sur 6 : V') && cells[4] === 'passé' && await page.isVisible('#netWarn') && await page.isEnabled('#go') && await page.isHidden('#next'), `${tag} H passé (${cells.join(' ')}), V prêt sur la même page, avertissement « mode avion »`);
      await ctx.setOffline(true);
      await page.waitForTimeout(100);
      check(await page.isHidden('#netWarn'), `${tag} V hors ligne : avertissement retiré`);
      await ev(() => { window.__failNet = true; });
      await page.click('#go');
      await waitLog('Essai 6 fini : 0 réplique complète sur 2', 20000);
      check((await text('#verdict')).includes('erreur « réseau »') && (await report()).includes('V1 erreur : network'), `${tag} V erreur « réseau » : conclusion « ta voix part chez Apple »`);
      await page.screenshot({ path: `${shots}/${scheme}-${width}-mode-avion-reseau.png`, fullPage: true });
      await answer('fort', 'venant du bas (haut-parleur)', 'non');
      const syn = (await report()).split('Essais :')[0];
      check(syn.includes('5. H M avec écouteurs, appli rouverte : passé') && syn.includes('6. V M en mode avion, appli rouverte (appli rouverte) : ta voix entendue 0/2') && syn.includes('erreur « réseau » : sans connexion'), `${tag} synthèse : H passé, V erreur « réseau »`);
      check((await text('#next')).includes('Série finie'), `${tag} V série finie`);
      await ctx.setOffline(false);
    }
    check(errors.length === 0, `${tag} aucune erreur dans la console${errors.length ? ' : ' + errors.join(' | ') : ''}`);
    const overflow = await ev(() => document.documentElement.scrollWidth > window.innerWidth);
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
