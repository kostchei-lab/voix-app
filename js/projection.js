// Échelle de projection : calculs purs (sans écran), testés dans tests/projection.test.js.
// Une « phrase » = les mesures voisées entre le premier son et 0,8 s de silence.
import { hzToMidi, midiToHz } from './notes.js';
import { percentile } from './analysis.js';

export const PHRASE = '« Bonjour à tous, merci d’être venus ce soir. »';
export const LIMIT_ST = 2; // montée de hauteur tolérée, en demi-tons au-dessus de la référence
export const VOL_TOL_DB = 1; // un palier est atteint à 1 dB près
export const LOW_ST = -3; // en dessous : voix écrasée vers le grave
export const MIN_VOICED = 25; // 0,5 s de voix au minimum
export const END_SILENCE = 40; // 0,8 s sans voix : fin de la phrase
export const MAX_FRAMES = 500; // 10 s au plus
export const BILAN1_MONTEE_A6 = 5.5; // bilan 1 : +6,5 dt pour +7,1 dB, ramené à +6 dB

export const STEPS = [
  {
    key: 'ref', target: 0, title: 'Référence',
    how: 'Debout, à voix normale, comme à quelqu’un à 1 mètre.',
  },
  {
    key: 'p2', target: 2, title: 'Palier +2 dB',
    how: 'Un peu plus fort, pour quelqu’un à 3 mètres. Garde ta note de départ.',
    cue: 'Pense « plus large », pas « plus haut ».',
  },
  {
    key: 'p4', target: 4, title: 'Palier +4 dB',
    how: 'Plus fort, pour le milieu de la salle.',
    cue: 'Laisse la mâchoire s’ouvrir ; le souffle pousse, la gorge reste souple.',
  },
  {
    key: 'p6', target: 6, title: 'Palier +6 dB',
    how: 'Pour le fond de la salle. Projette sans crier.',
    cue: 'Vise le mur du fond avec le son, pas avec la note.',
  },
  {
    key: 'aveugle', target: 6, blind: true, title: 'Sans regarder',
    how: 'Jauges masquées. Même consigne qu’au palier +6 dB, en te fiant à tes sensations. Le verdict vient après.',
  },
];

// Découpe en direct : on lui passe chaque mesure (toutes les 20 ms).
export class PhraseCatcher {
  constructor() { this.reset(); }
  reset() {
    this.frames = [];
    this.started = false;
    this.silent = 0;
  }
  // Renvoie null tant que la phrase n'est pas finie, sinon la liste des mesures voisées.
  push(f) {
    const voiced = f.f0 > 0;
    if (!this.started) {
      if (!voiced) return null;
      this.started = true;
    }
    if (voiced) {
      this.frames.push({ f0: f.f0, db: f.db });
      this.silent = 0;
    } else {
      this.silent++;
    }
    if (this.silent >= END_SILENCE || this.frames.length >= MAX_FRAMES) {
      const out = this.frames;
      this.reset();
      return out;
    }
    return null;
  }
}

// Résumé d'une phrase : volume et hauteur médians sur les mesures voisées.
export function summarizePhrase(frames) {
  const mids = frames.map((f) => hzToMidi(f.f0)).sort((a, b) => a - b);
  const dbs = frames.map((f) => f.db).sort((a, b) => a - b);
  return {
    n: frames.length,
    dur: frames.length * 0.02,
    db: percentile(dbs, 0.5),
    midi: percentile(mids, 0.5),
    hz: frames.length ? midiToHz(percentile(mids, 0.5)) : 0,
  };
}

// Verdict d'un palier par rapport à la référence.
export function judge(step, phrase, ref) {
  if (phrase.n < MIN_VOICED) return { ok: false, short: true };
  if (step.key === 'ref' || !ref) return { ok: true, ref: true };
  const gainDb = phrase.db - ref.db;
  const riseSt = phrase.midi - ref.midi;
  const volOk = gainDb >= step.target - VOL_TOL_DB;
  const pitchOk = riseSt <= LIMIT_ST;
  return {
    ok: volOk && pitchOk,
    gainDb,
    riseSt,
    volOk,
    pitchOk,
    tooLoud: gainDb > step.target + 4,
    tooLow: riseSt < LOW_ST,
  };
}

// Score de séance à partir du dernier essai retenu à chaque palier.
// Pente = droite passant par la référence (0 dB, 0 dt), en demi-tons par dB.
export function sessionScore(essais) {
  const last = new Map();
  for (const e of essais) if (e.step !== 'ref' && !e.short) last.set(e.step, e);
  const pts = [...last.values()];
  const sxx = pts.reduce((s, e) => s + e.gainDb * e.gainDb, 0);
  const sxy = pts.reduce((s, e) => s + e.gainDb * e.riseSt, 0);
  const maxGain = pts.reduce((m, e) => Math.max(m, e.gainDb), -Infinity);
  const reliable = pts.length >= 2 && maxGain >= 3 && sxx > 0;
  const slope = reliable ? sxy / sxx : NaN;
  const blind = last.get('aveugle') || null;
  return {
    paliers: pts.length,
    reussis: pts.filter((e) => e.ok).length,
    penteCentsParDb: reliable ? slope * 100 : NaN,
    monteeA6: reliable ? slope * 6 : NaN,
    aveugle: blind ? { gainDb: blind.gainDb, riseSt: blind.riseSt, ok: blind.ok } : null,
    fiable: reliable,
  };
}
