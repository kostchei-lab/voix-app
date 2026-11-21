// Onglet « Parole » : exercices de prise de parole. Échelle de projection (ici) et zone calme (zone-calme.js).
import {
  STEPS, PHRASE, LIMIT_ST, VOL_TOL_DB, BILAN1_MONTEE_A6,
  PhraseCatcher, summarizePhrase, judge, sessionScore,
} from './projection.js';
import { hzToMidi } from './notes.js';
import { percentile, fmt } from './analysis.js';
import { createCalme } from './zone-calme.js';

const EXERCICES = [
  { key: 'projection', title: 'Échelle de projection', what: 'Parler plus fort sans que la voix monte.', ready: true },
  { key: 'calme', title: 'Zone calme', what: 'Parler debout avec ta voix du calme, entre 125 et 145 Hz.', ready: true },
  { key: 'fins', title: 'Fins d’idée', what: 'Faire descendre la voix en fin de phrase.' },
  { key: 'souffle', title: 'Résonance et souffle', what: 'Paille, voix résonante, tenue chronométrée.' },
];

const signed = (n, d = 1) => (!Number.isFinite(n) ? '—' : (n > 0.05 ? '+' : n < -0.05 ? '−' : '±') + fmt(Math.abs(n), d));
const dateFr = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function createParole(ctx) {
  const { engine, store, el, button, toast, startMic, isBluetooth, shareFiles, version } = ctx;
  const root = document.querySelector('#paroleRoot');

  let screen = 'menu'; // menu | exo | score | calme
  let seance = null; // { id, date, ref, essais, index }
  let phase = 'idle'; // idle | listening | verdict
  let lastVerdict = null;
  let seances = [];
  const catcher = new PhraseCatcher();
  const recent = []; // dernières mesures voisées, pour les jauges
  let gauges = null;
  let levelBar = null;
  const calme = createCalme({
    ...ctx,
    root,
    rerender: () => render(),
    back: async () => { screen = 'menu'; await load(); render(); },
  });

  // ---------- Mesures ----------
  engine.addEventListener('frame', (e) => {
    const f = e.detail;
    if (f.f0 > 0) {
      recent.push({ at: performance.now(), midi: hzToMidi(f.f0), db: f.db });
      if (recent.length > 15) recent.shift();
    }
    if (screen !== 'exo' || phase !== 'listening') return;
    const frames = catcher.push(f);
    if (frames) onPhrase(frames);
  });
  engine.addEventListener('stop', () => {
    if (phase === 'listening') { phase = 'idle'; if (screen === 'exo') render(); }
  });

  function onPhrase(frames) {
    const step = STEPS[seance.index];
    const p = summarizePhrase(frames);
    const v = judge(step, p, seance.ref);
    const essai = {
      step: step.key, target: step.target, blind: !!step.blind,
      hz: +p.hz.toFixed(1), db: +p.db.toFixed(1), dur: +p.dur.toFixed(2), n: p.n,
      short: !!v.short, ok: v.ok,
    };
    if (!v.short && step.key !== 'ref') {
      Object.assign(essai, { gainDb: +v.gainDb.toFixed(2), riseSt: +v.riseSt.toFixed(2), volOk: v.volOk, pitchOk: v.pitchOk });
    }
    seance.essais.push(essai);
    if (step.key === 'ref' && !v.short) seance.ref = { db: p.db, midi: p.midi, hz: p.hz };
    lastVerdict = { ...v, phrase: p };
    phase = 'verdict';
    render();
  }

  // ---------- Écrans ----------
  function render() {
    root.replaceChildren();
    gauges = null;
    levelBar = null;
    const head = document.querySelector('.view-parole .view-head');
    if (head) head.hidden = screen !== 'menu';
    if (screen === 'menu') renderMenu();
    else if (screen === 'calme') calme.render();
    else if (screen === 'exo') renderExo();
    else renderScore();
  }

  function renderMenu() {
    const list = el('ul', 'exos');
    for (const x of EXERCICES) {
      const li = el('li', 'exo' + (x.ready ? '' : ' later'));
      const txt = el('div', 'exo-txt');
      txt.append(el('h2', null, x.title), el('p', null, x.what));
      li.append(txt);
      if (x.ready) {
        const b = button('Commencer', 'btn primary small');
        b.id = x.key === 'calme' ? 'btnCalmeStart' : 'btnProjStart';
        b.addEventListener('click', x.key === 'calme' ? startCalme : startSeance);
        li.append(b);
      } else {
        li.append(el('span', 'exo-soon', 'Bientôt'));
      }
      list.append(li);
    }
    root.append(list);
    renderHistory();
    root.append(calme.historyPanel());
  }

  function startCalme() {
    screen = 'calme';
    calme.start();
  }

  function renderHistory() {
    const box = el('div', 'panel');
    box.append(el('h2', null, 'Séances d’échelle de projection'));
    const ref = el('p', 'hint');
    ref.textContent = `Montée de hauteur pour +6 dB. Bilan 1 : ≈ +${fmt(BILAN1_MONTEE_A6, 1)} dt. Cible du bilan 2 : ≤ +${LIMIT_ST} dt.`;
    box.append(ref);
    if (!seances.length) {
      box.append(el('p', 'empty', 'Aucune séance pour l’instant.'));
      root.append(box);
      return;
    }
    box.append(trend());
    const ul = el('ul', 'seances');
    for (const s of [...seances].reverse().slice(0, 20)) {
      const li = el('li', 'seance');
      const sc = s.score;
      const good = Number.isFinite(sc.monteeA6) && sc.monteeA6 <= LIMIT_ST;
      const head = el('div', 'seance-head');
      head.append(el('span', 'seance-date', dateFr(s.date)), el('strong', good ? 'good' : '', Number.isFinite(sc.monteeA6) ? signed(sc.monteeA6) + ' dt' : '—'));
      const meta = el('p', 'prise-meta', [
        Number.isFinite(sc.penteCentsParDb) ? fmt(sc.penteCentsParDb) + ' cents par dB' : 'pente non calculée',
        `${sc.reussis}/${sc.paliers} paliers réussis`,
        sc.aveugle ? 'sans regarder : ' + (sc.aveugle.ok ? 'réussi' : signed(sc.aveugle.riseSt) + ' dt') : null,
      ].filter(Boolean).join(' · '));
      const del = button('Supprimer', 'link-btn');
      del.addEventListener('click', async () => {
        if (!confirm('Supprimer cette séance ?')) return;
        await store.removeSeance(s.id);
        await load();
        render();
      });
      li.append(head, meta, del);
      ul.append(li);
    }
    const exp = button('Exporter les séances', 'btn small');
    exp.addEventListener('click', exportSeances);
    box.append(ul, exp);
    root.append(box);
  }

  // Petite courbe d'évolution : montée à +6 dB, séance après séance, avec la cible.
  function trend() {
    const pts = seances.map((s) => s.score.monteeA6).filter(Number.isFinite);
    const fig = el('figure', 'trend');
    if (pts.length < 2) return fig;
    const W = 300, H = 90, P = 6;
    const hi = Math.max(BILAN1_MONTEE_A6, ...pts) + 0.5;
    const lo = Math.min(0, ...pts);
    const x = (i) => P + (i * (W - 2 * P)) / (pts.length - 1);
    const y = (v) => H - P - ((v - lo) * (H - 2 * P)) / (hi - lo);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Évolution de la montée de hauteur à +6 dB : ' + pts.map((v) => signed(v)).join(', ') + ' demi-tons');
    const line = (cls, y0) => { const l = document.createElementNS(ns, 'line'); l.setAttribute('class', cls); l.setAttribute('x1', P); l.setAttribute('x2', W - P); l.setAttribute('y1', y0); l.setAttribute('y2', y0); svg.append(l); };
    line('t-target', y(LIMIT_ST));
    line('t-start', y(BILAN1_MONTEE_A6));
    const path = document.createElementNS(ns, 'polyline');
    path.setAttribute('points', pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '));
    path.setAttribute('class', 't-line');
    svg.append(path);
    pts.forEach((v, i) => { const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', x(i)); c.setAttribute('cy', y(v)); c.setAttribute('r', 3); c.setAttribute('class', v <= LIMIT_ST ? 't-dot good' : 't-dot'); svg.append(c); });
    const cap = el('figcaption', 'hint', 'Trait plein : cible (+2 dt). Pointillés : bilan 1.');
    fig.append(svg, cap);
    return fig;
  }

  function renderExo() {
    const step = STEPS[seance.index];
    const nav = el('ol', 'bilan-nav proj-nav');
    STEPS.forEach((s, i) => {
      const done = seance.essais.some((e) => e.step === s.key && (s.key === 'ref' ? !e.short : e.ok));
      const tried = seance.essais.some((e) => e.step === s.key && !e.short);
      const c = el('li');
      const chip = el('span', 'nav-chip' + (done ? ' done' : tried ? ' tried' : ''), s.key === 'ref' ? 'Réf' : s.blind ? 'Sans' : '+' + s.target);
      if (i === seance.index) chip.setAttribute('aria-current', 'step');
      c.append(chip);
      nav.append(c);
    });

    const art = el('article', 'step');
    const head = el('div', 'step-head');
    head.append(el('h2', null, step.title));
    art.append(el('p', 'step-part', 'Échelle de projection'), head, el('p', 'step-how', step.how));
    if (step.cue) art.append(el('p', 'hint', 'Repère : ' + step.cue));
    art.append(el('p', 'read', PHRASE));

    const info = engine.running && engine.info ? engine.info() : null;
    if (info && isBluetooth(info.label)) {
      art.append(el('p', 'hint warn', 'Micro Bluetooth : son retraité, les dB ne sont pas fiables. Prends le DJI.'));
    }

    const status = el('div', 'proj-status');
    status.setAttribute('aria-live', 'polite');
    status.id = 'projStatus';
    art.append(status);
    renderStatus(status, step);

    // Jauges en direct (sauf pour la référence et le passage sans regarder)
    if (step.key === 'ref') {
      const lv = el('div', 'step-level');
      const meter = el('div', 'meter');
      levelBar = el('span');
      meter.append(levelBar);
      lv.append(el('span', 'hint', 'Niveau'), meter);
      art.append(lv);
    } else if (step.blind && phase !== 'verdict') {
      art.append(el('p', 'blind', 'Jauges masquées'));
    } else {
      gauges = makeGauges(step);
      art.append(gauges.root);
    }

    const dock = el('div', 'step-dock');
    const row = el('div', 'controls');
    if (!engine.running) {
      const b = button('Activer le micro', 'btn primary');
      b.addEventListener('click', async () => { await startMic(); if (engine.running) listen(); });
      row.append(b);
    } else if (phase === 'idle') {
      const b = button('Écouter', 'btn primary');
      b.addEventListener('click', listen);
      row.append(b);
    } else if (phase === 'verdict') {
      const again = button(lastVerdict.short ? 'Recommencer' : 'Refaire', 'btn');
      again.id = 'btnProjAgain';
      again.addEventListener('click', listen);
      row.append(again);
      if (!lastVerdict.short) {
        const last = seance.index === STEPS.length - 1;
        const next = button(last ? 'Voir le score' : 'Palier suivant', 'btn primary');
        next.id = 'btnProjNext';
        next.addEventListener('click', () => (last ? finish() : goNext()));
        row.append(next);
      }
    }
    dock.append(row);
    const foot = el('div', 'step-foot');
    const quit = button('Quitter', 'link-btn');
    quit.addEventListener('click', () => { phase = 'idle'; seance = null; screen = 'menu'; render(); });
    foot.append(quit);
    if (seance.essais.some((e) => e.step !== 'ref' && !e.short) && seance.index < STEPS.length - 1) {
      const stop = button('Arrêter et voir le score', 'link-btn');
      stop.addEventListener('click', finish);
      foot.append(stop);
    }
    dock.append(foot);

    root.append(nav, art, dock);
    const cur = nav.querySelector('[aria-current="step"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function renderStatus(box, step) {
    if (phase === 'listening') {
      box.append(el('p', 'listening', 'J’écoute : dis la phrase.'));
      return;
    }
    if (phase !== 'verdict' || !lastVerdict) return;
    const v = lastVerdict;
    if (v.short) {
      box.append(el('p', 'verdict bad', 'Trop court : je n’ai pas entendu assez de voix. Dis toute la phrase.'));
      return;
    }
    if (step.key === 'ref') {
      box.append(el('p', 'verdict good', `Référence notée : ${fmt(v.phrase.hz)} Hz.`));
      box.append(el('p', 'hint', 'Les paliers se mesurent à partir de cette phrase.'));
      return;
    }
    box.append(el('p', 'verdict ' + (v.ok ? 'good' : 'bad'), v.ok ? 'Palier réussi.' : 'Pas encore.'));
    const dl = el('dl', 'verdict-kv');
    dl.append(
      el('dt', null, 'Volume'), el('dd', v.volOk ? 'good' : 'bad', `${signed(v.gainDb)} dB ${v.volOk ? '✓' : '✗'} (visé +${step.target})`),
      el('dt', null, 'Hauteur'), el('dd', v.pitchOk ? 'good' : 'bad', `${signed(v.riseSt)} dt ${v.pitchOk ? '✓' : '✗'} (limite +${LIMIT_ST})`),
    );
    box.append(dl);
    if (!v.volOk) box.append(el('p', 'hint', 'Plus de volume : vise plus loin dans la salle.'));
    if (!v.pitchOk) box.append(el('p', 'hint', 'La voix est montée : garde ta note de départ et ouvre plutôt le son.'));
    if (v.tooLow) box.append(el('p', 'hint warn', 'La voix est descendue nettement sous ta référence : ne l’écrase pas, reste naturel.'));
    if (v.tooLoud) box.append(el('p', 'hint', 'Bien plus fort que demandé : inutile de forcer.'));
  }

  // ---------- Jauges ----------
  function makeGauge(title, min, max, unit) {
    const g = el('div', 'gauge');
    const track = el('div', 'gauge-track');
    const pos = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
    const marker = el('div', 'gauge-marker');
    const value = el('div', 'gauge-value', '—');
    g.append(el('div', 'gauge-title', title), track, value);
    return {
      root: g,
      track,
      band(a, b, cls) { const z = el('div', 'gauge-band ' + cls); z.style.bottom = pos(a) + '%'; z.style.height = (pos(b) - pos(a)) + '%'; track.append(z); },
      tick(v, label, cls = '') { const t = el('div', 'gauge-tick ' + cls); t.style.bottom = pos(v) + '%'; t.append(el('span', null, label)); track.append(t); },
      finish() { track.append(marker); },
      set(v, ok) {
        if (!Number.isFinite(v)) { marker.hidden = true; value.textContent = '—'; return; }
        marker.hidden = false;
        marker.style.bottom = pos(v) + '%';
        marker.className = 'gauge-marker ' + (ok ? 'good' : 'bad');
        value.textContent = signed(v) + ' ' + unit;
      },
    };
  }

  function makeGauges(step) {
    const wrap = el('div', 'gauges');
    const vol = makeGauge('Volume', -4, 12, 'dB');
    vol.band(step.target - VOL_TOL_DB, step.target + 3, 'target');
    vol.tick(0, 'réf');
    vol.tick(step.target, '+' + step.target, 'strong');
    vol.finish();
    const pit = makeGauge('Hauteur', -4, 8, 'dt');
    pit.band(-3, LIMIT_ST, 'target');
    pit.band(LIMIT_ST, 8, 'over');
    pit.tick(0, 'réf');
    pit.tick(LIMIT_ST, 'limite', 'strong');
    pit.finish();
    wrap.append(vol.root, pit.root);
    const api = {
      root: wrap,
      set(gain, rise) {
        vol.set(gain, gain >= step.target - VOL_TOL_DB);
        pit.set(rise, rise <= LIMIT_ST);
      },
    };
    if (phase === 'verdict' && lastVerdict && !lastVerdict.short) api.set(lastVerdict.gainDb, lastVerdict.riseSt);
    return api;
  }

  // Appelé par la boucle d'affichage (toutes les 80 ms environ)
  function tick() {
    if (screen === 'calme') { calme.tick(); return; }
    if (screen !== 'exo') return;
    if (levelBar) {
      const v = engine.running ? Math.max(0, Math.min(1, (engine.lastDb + 70) / 70)) : 0;
      levelBar.style.width = (v * 100).toFixed(1) + '%';
    }
    if (!gauges || phase !== 'listening' || !seance.ref) return;
    const now = performance.now();
    const fresh = recent.filter((r) => now - r.at < 400);
    if (fresh.length < 4) { gauges.set(NaN, NaN); return; }
    const db = percentile(fresh.map((r) => r.db).sort((a, b) => a - b), 0.5);
    const midi = percentile(fresh.map((r) => r.midi).sort((a, b) => a - b), 0.5);
    gauges.set(db - seance.ref.db, midi - seance.ref.midi);
  }

  // ---------- Déroulé ----------
  async function startSeance() {
    seance = { id: 'proj-' + Date.now(), date: new Date().toISOString(), ref: null, essais: [], index: 0 };
    screen = 'exo';
    phase = 'idle';
    lastVerdict = null;
    if (!engine.running) await startMic();
    if (engine.running) listen(); else render();
  }

  function listen() {
    catcher.reset();
    recent.length = 0;
    phase = engine.running ? 'listening' : 'idle';
    lastVerdict = null;
    render();
  }

  function goNext() {
    seance.index++;
    listen();
  }

  async function finish() {
    phase = 'idle';
    const score = sessionScore(seance.essais);
    const info = engine.info ? engine.info() : null;
    const record = {
      id: seance.id,
      exo: 'projection',
      date: seance.date,
      version,
      micro: info ? info.label : '',
      ref: seance.ref ? { hz: +seance.ref.hz.toFixed(1), db: +seance.ref.db.toFixed(1) } : null,
      limiteSt: LIMIT_ST,
      essais: seance.essais,
      score,
    };
    seance.record = record;
    if (score.paliers) {
      try { await store.putSeance(record); } catch (e) { toast('Séance non enregistrée sur l’appareil.', true); }
      await load();
    }
    screen = 'score';
    render();
  }

  function renderScore() {
    const r = seance.record;
    const sc = r.score;
    const art = el('article', 'step');
    art.append(el('p', 'step-part', 'Échelle de projection'), el('h2', 'score-title', 'Score de la séance'));
    const big = el('div', 'score-big');
    const good = Number.isFinite(sc.monteeA6) && sc.monteeA6 <= LIMIT_ST;
    big.append(
      el('span', 'score-num ' + (good ? 'good' : ''), Number.isFinite(sc.monteeA6) ? signed(sc.monteeA6) + ' dt' : '—'),
      el('span', 'hint', 'de montée de hauteur pour +6 dB'),
    );
    art.append(big);
    if (!sc.fiable) art.append(el('p', 'hint', 'Pas assez d’écart de volume entre les paliers pour estimer la montée (il faut au moins +3 dB).'));
    else art.append(el('p', 'hint', `Bilan 1 : ≈ +${fmt(BILAN1_MONTEE_A6, 1)} dt. Cible : ≤ +${LIMIT_ST} dt. Pente : ${fmt(sc.penteCentsParDb)} cents par dB.`));

    const tbl = el('table', 'proj-table');
    const thead = el('tr');
    ['Palier', 'Volume', 'Hauteur', ''].forEach((h) => thead.append(el('th', null, h)));
    tbl.append(thead);
    for (const s of STEPS) {
      const e = [...r.essais].reverse().find((x) => x.step === s.key && !x.short);
      if (!e) continue;
      const tr = el('tr');
      tr.append(
        el('td', null, s.key === 'ref' ? 'Référence' : s.blind ? 'Sans regarder' : '+' + s.target + ' dB'),
        el('td', null, s.key === 'ref' ? 'réf.' : signed(e.gainDb) + ' dB'),
        el('td', null, s.key === 'ref' ? fmt(e.hz) + ' Hz' : signed(e.riseSt) + ' dt'),
        el('td', e.ok ? 'good' : 'bad', s.key === 'ref' ? '' : e.ok ? '✓' : '✗'),
      );
      tbl.append(tr);
    }
    art.append(tbl, el('p', 'hint', `${sc.reussis} palier(s) réussi(s) sur ${sc.paliers}. Le passage « sans regarder » montre ce qui reste sans l’écran.`));
    const dock = el('div', 'step-dock');
    const row = el('div', 'controls');
    const again = button('Nouvelle séance', 'btn');
    again.addEventListener('click', startSeance);
    const back = button('Terminé', 'btn primary');
    back.addEventListener('click', () => { seance = null; screen = 'menu'; render(); });
    row.append(again, back);
    dock.append(row);
    root.append(art, dock);
  }

  async function exportSeances() {
    const day = new Date().toISOString().slice(0, 10);
    const data = { app: 'Voix', version, exporte: new Date().toISOString(), seances };
    const file = new File([JSON.stringify(data, null, 1)], `voix-projection-${day}.json`, { type: 'application/json' });
    await shareFiles([file], 'Séances de projection');
  }

  async function load() {
    try {
      seances = (await store.allSeances()).filter((s) => s.exo === 'projection').sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) { seances = []; }
    await calme.load();
  }

  // Appelé à chaque image par la boucle d'affichage (courbe de la zone calme).
  function draw() {
    if (screen === 'calme') calme.draw();
  }

  async function open() {
    if (screen === 'menu') await load();
    render();
  }

  return { open, tick, draw, calme, state: () => ({ screen, phase, seance, seances }) };
}
