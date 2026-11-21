// Onglet « Parole », exercice 2 : la zone calme. Écran, déroulé et historique.
// Les calculs sont dans calme.js ; la découpe des phrases vient de projection.js.
import {
  ZONE, BILAN1, CIBLE_BILAN2, WIN, MIN_CENTRE, STEPS,
  median, zoneOf, summarizeCalme, judgeCalme, calmeScore,
} from './calme.js';
import { PhraseCatcher } from './projection.js';
import { Trace } from './trace.js';
import { hzToMidi, midiToHz } from './notes.js';
import { fmt } from './analysis.js';

const NAME = 'Zone calme';
const ZONE_TXT = `${ZONE.lo} à ${ZONE.hi} Hz`;
const LIVE_MSG = {
  in: 'Dans la zone',
  high: 'Au-dessus : redescends vers ta voix d’assis',
  low: 'En dessous : inutile d’appuyer vers le grave',
};
const signed = (n, d = 1) => (!Number.isFinite(n) ? '—' : (n > 0.05 ? '+' : n < -0.05 ? '−' : '±') + fmt(Math.abs(n), d));
const pct = (n) => (Number.isFinite(n) ? fmt(n) + ' %' : '—');
const dateFr = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function createCalme(ctx) {
  const { engine, store, el, button, toast, startMic, isBluetooth, shareFiles, version, notation, root, rerender, back } = ctx;

  let screen = 'exo'; // exo | score
  let seance = null; // { id, date, essais, index, record }
  let phase = 'idle'; // idle | listening | verdict
  let lastVerdict = null;
  let seances = [];
  let catcher = new PhraseCatcher();
  const win = []; // demi-tons des dernières mesures voisées (centre glissant)
  let voicedCount = 0;
  let lastVoicedAt = 0;
  let live = { shown: null, pending: null, since: 0 };
  let ui = null; // éléments vivants de l'écran en cours

  // Courbe : créée une fois, rattachée à chaque affichage.
  let trace = null;
  let canvas = null;
  function ensureTrace() {
    if (trace) return;
    canvas = el('canvas', 'calme-canvas');
    canvas.setAttribute('aria-label', `Courbe de hauteur de ta voix, avec la zone calme de ${ZONE_TXT}`);
    canvas.id = 'calmeTrace';
    trace = new Trace(canvas);
    trace.windowSec = 10;
    trace.span = 18;
    trace.fixed = true;
    trace.showNotes = false;
    trace.center = trace.targetCenter = (hzToMidi(ZONE.lo) + hzToMidi(ZONE.hi)) / 2 + 1;
    trace.zone = { lo: hzToMidi(ZONE.lo), hi: hzToMidi(ZONE.hi), labels: { lo: ZONE.lo + ' Hz', hi: ZONE.hi + ' Hz' } };
  }

  // ---------- Mesures ----------
  engine.addEventListener('frame', (e) => {
    if (!seance || screen !== 'exo' || phase !== 'listening') return;
    const f = e.detail;
    trace.push(f);
    if (f.f0 > 0) {
      win.push(hzToMidi(f.f0));
      if (win.length > WIN) win.shift();
      voicedCount++;
      lastVoicedAt = performance.now();
    }
    const frames = catcher.push(f);
    if (frames) onPhrase(frames);
  });
  engine.addEventListener('stop', () => {
    if (seance && phase === 'listening') { phase = 'idle'; rerender(); }
  });

  function onPhrase(frames) {
    const step = STEPS[seance.index];
    const p = summarizeCalme(frames);
    const v = judgeCalme(step, p);
    const essai = { step: step.key, standing: step.standing, blind: !!step.blind, n: p.n, dur: +p.dur.toFixed(2), short: v.short, ok: v.ok };
    if (!v.short) {
      Object.assign(essai, {
        hz: +p.hz.toFixed(1),
        etendue: +p.etendue.toFixed(1),
        pctZone: Math.round(p.pctZone),
        pctHigh: Math.round(p.pctHigh),
        pctLow: Math.round(p.pctLow),
        where: v.where,
        flat: v.flat,
      });
    }
    seance.essais.push(essai);
    lastVerdict = { ...v, phrase: p };
    phase = 'verdict';
    rerender();
  }

  // ---------- Écrans ----------
  function render() {
    ui = null;
    if (screen === 'score') renderScore();
    else renderExo();
  }

  function renderExo() {
    ensureTrace();
    trace.notation = notation ? notation() : 'fr';
    const step = STEPS[seance.index];
    const nav = el('ol', 'bilan-nav proj-nav');
    STEPS.forEach((s, i) => {
      const done = seance.essais.some((e) => e.step === s.key && e.ok);
      const tried = seance.essais.some((e) => e.step === s.key && !e.short);
      const c = el('li');
      const chip = el('span', 'nav-chip' + (done ? ' done' : tried ? ' tried' : ''), s.short);
      if (i === seance.index) chip.setAttribute('aria-current', 'step');
      c.append(chip);
      nav.append(c);
    });

    const art = el('article', 'step');
    const head = el('div', 'step-head');
    head.append(el('h2', null, step.title));
    art.append(el('p', 'step-part', NAME), head, el('p', 'step-how', step.how));
    if (step.cue) art.append(el('p', 'hint', 'Repère : ' + step.cue));
    if (step.text) art.append(el('p', 'read', step.text));

    const info = engine.running && engine.info ? engine.info() : null;
    if (info && isBluetooth(info.label)) {
      art.append(el('p', 'hint warn', 'Micro Bluetooth : son retraité. Prends le DJI.'));
    }

    const status = el('div', 'proj-status');
    status.setAttribute('aria-live', 'polite');
    status.id = 'calmeStatus';
    art.append(status);
    renderStatus(status, step);

    // Retour en direct : centre de la voix et courbe avec la zone (masqués pour « sans regarder »)
    if (step.blind && phase !== 'verdict') {
      art.append(el('p', 'blind', 'Courbe masquée'));
    } else {
      const liveRow = el('div', 'calme-live');
      const hz = el('span', 'calme-hz', '—');
      hz.id = 'calmeHz';
      const msg = el('span', 'calme-msg', phase === 'listening' ? 'Parle : ta voix s’affiche ici.' : '');
      msg.id = 'calmeMsg';
      liveRow.append(hz, msg);
      liveRow.hidden = phase === 'verdict'; // le verdict donne déjà le centre de la phrase
      const stage = el('div', 'calme-stage');
      stage.id = 'calmeStage';
      stage.append(canvas);
      art.append(liveRow, stage, el('p', 'hint', `Bande verte : ta zone calme, ${ZONE_TXT}. Le chiffre donne le centre de ta voix sur la dernière seconde : la phrase peut monter et descendre autour.`));
      ui = { hz, msg, stage };
      if (phase === 'verdict' && lastVerdict && !lastVerdict.short) showCentre(lastVerdict.phrase.hz, lastVerdict.where, true);
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
    } else if (phase === 'listening' && step.free) {
      const b = button('J’ai fini', 'btn primary');
      b.id = 'btnCalmeDone';
      b.addEventListener('click', () => onPhrase(catcher.flush()));
      row.append(b);
    } else if (phase === 'verdict') {
      const again = button(lastVerdict.short ? 'Recommencer' : 'Refaire', 'btn');
      again.id = 'btnCalmeAgain';
      again.addEventListener('click', listen);
      row.append(again);
      if (!lastVerdict.short) {
        const last = seance.index === STEPS.length - 1;
        const next = button(last ? 'Voir le score' : 'Étape suivante', 'btn primary');
        next.id = 'btnCalmeNext';
        next.addEventListener('click', () => (last ? finish() : goNext()));
        row.append(next);
      }
    }
    if (row.children.length) dock.append(row);
    const foot = el('div', 'step-foot');
    const quit = button('Quitter', 'link-btn');
    quit.addEventListener('click', () => { phase = 'idle'; seance = null; back(); });
    foot.append(quit);
    if (seance.essais.some((e) => !e.short) && seance.index < STEPS.length - 1) {
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
      const p = el('p', 'listening', step.free ? 'J’écoute : parle 20 à 30 secondes, puis touche « J’ai fini ». ' : 'J’écoute : dis la phrase.');
      if (step.free) {
        const t = el('span', 'calme-time', '');
        t.id = 'calmeTime';
        p.append(t);
      }
      box.append(p);
      return;
    }
    if (phase !== 'verdict' || !lastVerdict) return;
    const v = lastVerdict;
    const p = v.phrase;
    if (v.short) {
      box.append(el('p', 'verdict bad', step.free
        ? 'Trop court : parle au moins 5 secondes, sans texte.'
        : 'Trop court : je n’ai pas entendu assez de voix. Dis toute la phrase.'));
      return;
    }
    const title = v.ok ? 'Dans la zone.' : v.where === 'high' ? 'Au-dessus de la zone.' : 'Sous la zone.';
    box.append(el('p', 'verdict ' + (v.ok ? 'good' : 'bad'), title));
    const dl = el('dl', 'verdict-kv');
    dl.append(
      el('dt', null, 'Centre'), el('dd', v.ok ? 'good' : 'bad', `${fmt(p.hz)} Hz ${v.ok ? '✓' : '✗'} (zone ${ZONE_TXT})`),
      el('dt', null, 'Dans la zone'), el('dd', null, pct(p.pctZone) + ' du temps'),
      el('dt', null, 'Mélodie'), el('dd', v.flat ? 'bad' : null, `${fmt(p.etendue, 1)} dt d’étendue`),
    );
    box.append(dl);
    if (step.key === 'assis') box.append(el('p', 'hint', `Ta voix assise : ${fmt(p.hz)} Hz. C’est elle que tu gardes debout.`));
    if (v.where === 'high') box.append(el('p', 'hint', 'Redescends vers ta voix d’assis : un « mm-hmm », puis la phrase sur la même note.'));
    if (v.where === 'low') box.append(el('p', 'hint', 'Inutile d’appuyer vers le grave. Si la voix grésille en fin de phrase, remonte un peu.'));
    if (v.flat) box.append(el('p', 'hint warn', 'Voix un peu plate : seul le centre doit rester dans la zone, la phrase peut monter et descendre.'));
  }

  function showCentre(hz, where, final = false) {
    if (!ui) return;
    if (!Number.isFinite(hz)) {
      ui.hz.textContent = '—';
      ui.hz.className = 'calme-hz';
      ui.msg.textContent = 'J’écoute…';
      ui.stage.className = 'calme-stage';
      return;
    }
    ui.hz.textContent = fmt(hz) + ' Hz';
    ui.hz.className = 'calme-hz ' + (where === 'in' ? 'good' : 'bad');
    ui.msg.textContent = final ? (where === 'in' ? 'Centre de la phrase, dans la zone' : 'Centre de la phrase') : LIVE_MSG[where];
    ui.stage.className = 'calme-stage' + (where && where !== 'in' ? ' out' : '');
  }

  // Appelé par la boucle d'affichage, toutes les 80 ms environ.
  function tick() {
    if (!seance || screen !== 'exo' || phase !== 'listening') return;
    const t = document.querySelector('#calmeTime');
    if (t) t.textContent = Math.floor(voicedCount * 0.02) + ' s de voix';
    if (!ui) return;
    const now = performance.now();
    if (win.length < MIN_CENTRE || now - lastVoicedAt > 1500) { showCentre(NaN); return; }
    const hz = midiToHz(median(win));
    const z = zoneOf(hz);
    // Un changement de zone n'est affiché qu'après 0,4 s, pour éviter le clignotement.
    if (z === live.shown) live.pending = z;
    else if (z !== live.pending) { live.pending = z; live.since = now; } else if (now - live.since >= 400 || live.shown === null) live.shown = z;
    showCentre(hz, live.shown || z);
  }

  // Appelé à chaque image : la courbe défile pendant l'écoute, reste figée ensuite.
  function draw() {
    if (!trace || !ui || !seance || screen !== 'exo') return;
    trace.draw(phase === 'listening' && engine.running);
  }

  // ---------- Déroulé ----------
  async function start() {
    seance = { id: 'calme-' + Date.now(), date: new Date().toISOString(), essais: [], index: 0 };
    screen = 'exo';
    phase = 'idle';
    lastVerdict = null;
    if (!engine.running) await startMic();
    if (engine.running) listen(); else rerender();
  }

  function listen() {
    const step = STEPS[seance.index];
    catcher = new PhraseCatcher({ endSilence: step.silence, maxFrames: step.max });
    win.length = 0;
    voicedCount = 0;
    lastVoicedAt = 0;
    live = { shown: null, pending: null, since: 0 };
    ensureTrace();
    trace.clear();
    phase = engine.running ? 'listening' : 'idle';
    lastVerdict = null;
    rerender();
  }

  function goNext() {
    seance.index++;
    listen();
  }

  async function finish() {
    phase = 'idle';
    const score = calmeScore(seance.essais);
    const info = engine.info ? engine.info() : null;
    const record = {
      id: seance.id,
      exo: 'calme',
      date: seance.date,
      version,
      micro: info ? info.label : '',
      zone: { ...ZONE },
      essais: seance.essais,
      score,
    };
    seance.record = record;
    if (score.etapes) {
      try { await store.putSeance(record); } catch (e) { toast('Séance non enregistrée sur l’appareil.', true); }
      await load();
    }
    screen = 'score';
    rerender();
  }

  function renderScore() {
    const r = seance.record;
    const sc = r.score;
    const art = el('article', 'step');
    art.append(el('p', 'step-part', NAME), el('h2', 'score-title', 'Score de la séance'));
    const big = el('div', 'score-big');
    const good = zoneOf(sc.centreDebout) === 'in';
    big.append(
      el('span', 'score-num ' + (good ? 'good' : ''), Number.isFinite(sc.centreDebout) ? fmt(sc.centreDebout) + ' Hz' : '—'),
      el('span', 'hint', 'centre de ta voix debout'),
    );
    art.append(big);
    art.append(el('p', 'hint', `Zone : ${ZONE_TXT}. Bilan 1, discours debout : ${fmt(BILAN1.debout)} Hz. Objectif du bilan 2, debout : ${CIBLE_BILAN2.lo} à ${CIBLE_BILAN2.hi} Hz.`));
    const kv = el('dl', 'verdict-kv');
    kv.append(
      el('dt', null, 'Dans la zone'), el('dd', null, pct(sc.pctZoneDebout) + ' du temps debout'),
      el('dt', null, 'Assis → debout'), el('dd', null, Number.isFinite(sc.ecartAssisDebout) ? signed(sc.ecartAssisDebout) + ' dt' : '—'),
    );
    art.append(kv);

    const tbl = el('table', 'proj-table');
    const thead = el('tr');
    ['Étape', 'Centre', 'Zone', ''].forEach((h) => thead.append(el('th', null, h)));
    tbl.append(thead);
    for (const s of STEPS) {
      const e = [...r.essais].reverse().find((x) => x.step === s.key && !x.short);
      if (!e) continue;
      const tr = el('tr');
      tr.append(
        el('td', null, s.title),
        el('td', null, fmt(e.hz) + ' Hz'),
        el('td', null, pct(e.pctZone)),
        el('td', e.ok ? 'good' : 'bad', e.ok ? '✓' : '✗'),
      );
      tbl.append(tr);
    }
    art.append(tbl, el('p', 'hint', `${sc.reussies} étape(s) réussie(s) sur ${sc.etapes}. « Zone » : part du temps où le centre de ta voix était dans la bande. Le passage « sans regarder » montre ce qui reste sans l’écran.`));
    const dock = el('div', 'step-dock');
    const row = el('div', 'controls');
    const again = button('Nouvelle séance', 'btn');
    again.addEventListener('click', start);
    const done = button('Terminé', 'btn primary');
    done.addEventListener('click', () => { seance = null; back(); });
    row.append(again, done);
    dock.append(row);
    root.append(art, dock);
  }

  // ---------- Historique (affiché dans le menu de l'onglet Parole) ----------
  function historyPanel() {
    const box = el('div', 'panel');
    box.id = 'calmeHistory';
    box.append(el('h2', null, 'Séances de zone calme'));
    box.append(el('p', 'hint', `Centre de ta voix debout. Bilan 1 : ${fmt(BILAN1.debout)} Hz. Zone : ${ZONE_TXT}.`));
    if (!seances.length) {
      box.append(el('p', 'empty', 'Aucune séance pour l’instant.'));
      return box;
    }
    box.append(trend());
    const ul = el('ul', 'seances');
    for (const s of [...seances].reverse().slice(0, 20)) {
      const li = el('li', 'seance');
      const sc = s.score;
      const good = zoneOf(sc.centreDebout) === 'in';
      const head = el('div', 'seance-head');
      head.append(el('span', 'seance-date', dateFr(s.date)), el('strong', good ? 'good' : '', Number.isFinite(sc.centreDebout) ? fmt(sc.centreDebout) + ' Hz' : '—'));
      const meta = el('p', 'prise-meta', [
        Number.isFinite(sc.pctZoneDebout) ? pct(sc.pctZoneDebout) + ' du temps dans la zone' : null,
        `${sc.reussies}/${sc.etapes} étapes réussies`,
        sc.aveugle ? 'sans regarder : ' + fmt(sc.aveugle.hz) + ' Hz ' + (sc.aveugle.ok ? '✓' : '✗') : null,
      ].filter(Boolean).join(' · '));
      const del = button('Supprimer', 'link-btn');
      del.addEventListener('click', async () => {
        if (!confirm('Supprimer cette séance ?')) return;
        await store.removeSeance(s.id);
        await load();
        rerender();
      });
      li.append(head, meta, del);
      ul.append(li);
    }
    const exp = button('Exporter les séances', 'btn small');
    exp.addEventListener('click', exportSeances);
    box.append(ul, exp);
    return box;
  }

  // Courbe d'évolution : centre debout, séance après séance, sur fond de zone.
  function trend() {
    const pts = seances.map((s) => s.score.centreDebout).filter(Number.isFinite);
    const fig = el('figure', 'trend');
    fig.id = 'calmeTrend';
    if (pts.length < 2) return fig;
    const W = 300, H = 90, P = 6;
    const hi = Math.max(BILAN1.debout, ...pts) + 5;
    const lo = Math.min(ZONE.lo, ...pts) - 5;
    const x = (i) => P + (i * (W - 2 * P)) / (pts.length - 1);
    const y = (v) => H - P - ((v - lo) * (H - 2 * P)) / (hi - lo);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Évolution du centre de ta voix debout : ' + pts.map((v) => fmt(v)).join(', ') + ' Hz');
    const band = document.createElementNS(ns, 'rect');
    band.setAttribute('class', 't-zone');
    band.setAttribute('x', P);
    band.setAttribute('width', W - 2 * P);
    band.setAttribute('y', y(ZONE.hi));
    band.setAttribute('height', y(ZONE.lo) - y(ZONE.hi));
    svg.append(band);
    const start = document.createElementNS(ns, 'line');
    start.setAttribute('class', 't-start');
    start.setAttribute('x1', P); start.setAttribute('x2', W - P);
    start.setAttribute('y1', y(BILAN1.debout)); start.setAttribute('y2', y(BILAN1.debout));
    svg.append(start);
    const path = document.createElementNS(ns, 'polyline');
    path.setAttribute('points', pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '));
    path.setAttribute('class', 't-line');
    svg.append(path);
    pts.forEach((v, i) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', x(i)); c.setAttribute('cy', y(v)); c.setAttribute('r', 3);
      c.setAttribute('class', zoneOf(v) === 'in' ? 't-dot good' : 't-dot');
      svg.append(c);
    });
    fig.append(svg, el('figcaption', 'hint', `Bande verte : zone (${ZONE_TXT}). Pointillés : bilan 1, debout (${fmt(BILAN1.debout)} Hz).`));
    return fig;
  }

  async function exportSeances() {
    const day = new Date().toISOString().slice(0, 10);
    const data = { app: 'Voix', version, exercice: 'zone calme', exporte: new Date().toISOString(), seances };
    const file = new File([JSON.stringify(data, null, 1)], `voix-zone-calme-${day}.json`, { type: 'application/json' });
    await shareFiles([file], 'Séances de zone calme');
  }

  async function load() {
    try {
      seances = (await store.allSeances()).filter((s) => s.exo === 'calme').sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) { seances = []; }
  }

  return {
    start, render, tick, draw, load, historyPanel,
    state: () => ({ screen, phase, seance, seances }),
  };
}
