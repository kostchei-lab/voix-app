// Zone calme : calculs purs (sans écran), testés dans tests/calme.test.js.
// Idée : le « centre » de la voix (médiane de la dernière seconde de voix) reste dans une bande
// grave, 125 à 145 Hz, pendant que la phrase garde sa mélodie autour.
import { hzToMidi, midiToHz } from './notes.js';
import { percentile } from './analysis.js';

export const ZONE = { lo: 125, hi: 145 }; // bande d'entraînement, en Hz
export const BILAN1 = { debout: 162.5, libre: 135.7 }; // bilan 1 : discours debout (B5), parole libre (B4)
export const CIBLE_BILAN2 = { lo: 140, hi: 150 }; // objectif 2 du bilan 2 : voix parlée debout
export const WIN = 50; // centre = médiane des 50 dernières mesures voisées (1 s de voix)
export const MIN_CENTRE = 15; // au moins 0,3 s de voix pour donner un centre
export const FLAT_ST = 4; // étendue de 10 à 90 % sous 4 demi-tons : voix plate (bilan 1 : 7,8 à 9,4)
export const MIN_VOICED = 25; // phrase : 0,5 s de voix au minimum

export const STEPS = [
  {
    key: 'assis', short: 'Assis', title: 'Assis, au calme', standing: false,
    how: 'Assis, détendu, comme dans une conversation à deux.',
    cue: 'Dis « mm-hmm » comme pour approuver quelqu’un, puis enchaîne la phrase sur la même note.',
    text: '« Je vous propose de commencer par le point principal. »',
  },
  {
    key: 'debout', short: 'Debout', title: 'Debout', standing: true,
    how: 'Lève-toi, face à un comité imaginaire. Garde la voix que tu avais assis.',
    cue: 'Épaules basses, poids sur les deux pieds. Un « mm-hmm » avant de parler, si besoin.',
    text: '« Bonjour à tous, merci d’être venus ce soir. »',
  },
  {
    key: 'deux', short: '2 phrases', title: 'Debout, deux phrases', standing: true, silence: 75,
    how: 'Deux phrases d’affilée. Respire entre les deux et repars de la zone.',
    text: '« Voici ce que nous avons appris cette année. Trois points méritent votre attention. »',
  },
  {
    key: 'libre', short: 'Libre', title: 'Parole libre', standing: true, free: true, silence: 150, min: 250, max: 1500,
    how: 'Debout, sans texte, 20 à 30 secondes : présente le sujet de ta prochaine réunion ou de ton prochain cours.',
    cue: 'Si le cadre devient rouge, finis ta phrase, puis repars plus bas.',
  },
  {
    key: 'aveugle', short: 'Sans', title: 'Sans regarder', standing: true, blind: true,
    how: 'Courbe masquée. Debout, avec ta voix calme, en te fiant à tes sensations. Le verdict vient après.',
    text: '« Prenons un exemple concret, puis nous passerons aux questions. »',
  },
];

export const median = (arr) => percentile([...arr].sort((a, b) => a - b), 0.5);

export function zoneOf(hz, zone = ZONE) {
  if (!(hz > 0)) return null;
  return hz > zone.hi ? 'high' : hz < zone.lo ? 'low' : 'in';
}

// Centre glissant : pour chaque mesure voisée, médiane (en demi-tons) des WIN dernières.
export function rollingCentres(frames, win = WIN) {
  const mids = frames.map((f) => hzToMidi(f.f0));
  const out = [];
  for (let i = MIN_CENTRE - 1; i < mids.length; i++) {
    out.push(midiToHz(median(mids.slice(Math.max(0, i - win + 1), i + 1))));
  }
  return out;
}

// Résumé d'une phrase : centre (médiane), étendue de 10 à 90 %, part du temps dans la zone.
export function summarizeCalme(frames, zone = ZONE) {
  const mids = frames.map((f) => hzToMidi(f.f0)).sort((a, b) => a - b);
  const centres = rollingCentres(frames);
  const share = (z) => (centres.length ? (centres.filter((c) => zoneOf(c, zone) === z).length / centres.length) * 100 : NaN);
  const med = percentile(mids, 0.5);
  return {
    n: frames.length,
    dur: frames.length * 0.02,
    midi: med,
    hz: frames.length ? midiToHz(med) : 0,
    etendue: frames.length ? percentile(mids, 0.9) - percentile(mids, 0.1) : NaN,
    pctZone: share('in'),
    pctHigh: share('high'),
    pctLow: share('low'),
  };
}

// Verdict d'une étape : le centre de la phrase est-il dans la zone ?
export function judgeCalme(step, p, zone = ZONE) {
  const min = step.min || MIN_VOICED;
  if (p.n < min) return { ok: false, short: true };
  const where = zoneOf(p.hz, zone);
  return { ok: where === 'in', short: false, where, flat: p.etendue < FLAT_ST };
}

// Score de séance, à partir du dernier essai retenu à chaque étape.
// Centre debout : moyenne des centres des étapes debout, pondérée par la durée de voix.
export function calmeScore(essais) {
  const last = new Map();
  for (const e of essais) if (!e.short) last.set(e.step, e);
  const all = [...last.values()];
  const debout = all.filter((e) => e.standing);
  const n = debout.reduce((s, e) => s + e.n, 0);
  const midi = n ? debout.reduce((s, e) => s + hzToMidi(e.hz) * e.n, 0) / n : NaN;
  const withPct = debout.filter((e) => Number.isFinite(e.pctZone));
  const nPct = withPct.reduce((s, e) => s + e.n, 0);
  const assis = last.get('assis');
  const blind = last.get('aveugle');
  return {
    etapes: all.length,
    reussies: all.filter((e) => e.ok).length,
    centreDebout: n ? midiToHz(midi) : NaN,
    pctZoneDebout: nPct ? withPct.reduce((s, e) => s + e.pctZone * e.n, 0) / nPct : NaN,
    assis: assis ? assis.hz : NaN,
    ecartAssisDebout: assis && n ? midi - hzToMidi(assis.hz) : NaN,
    aveugle: blind ? { hz: blind.hz, ok: blind.ok } : null,
  };
}
