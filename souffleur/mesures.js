// Mesures d'une prise de réplique, à partir des trames de Voix (toutes les 20 ms : t, f0, db).
// Ce sont des indices sur la voix (débit, pauses, mélodie, volume), pas un jugement du jeu.
import { percentile } from '../js/analysis.js';
import { hzToMidi } from '../js/notes.js';

export const HOP = 0.02;
const VOWEL_GROUPS = /[aeiouyàâäéèêëîïôöùûüÿœæ]+/g;

// Syllabes d'un mot écrit, estimation : groupes de voyelles, moins le « e » muet final
// (« taire » = 1, « trompé » = 2). Un mot élidé (« qu’ », « l’ ») ne compte pas.
export function syllables(word) {
  if (/[’']$/.test(word)) return 0;
  const w = word.toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüÿœæç]/g, '');
  if (!w) return 0;
  let n = (w.match(VOWEL_GROUPS) || []).length;
  if (n > 1 && /[^aeiouyàâäéèêëîïôöùûüÿœæ]es?$/.test(w)) n--;
  return Math.max(n, 1);
}
export function textSyllables(text) {
  return text.replace(/[’']/g, '’ ').replace(/-/g, ' ').split(/\s+/).reduce((s, w) => s + syllables(w), 0);
}

// Parole et pauses. Une trame est « parole » si elle dépasse nettement le bruit de fond de la prise
// (10e centile du volume) ou si elle est voisée. Les trous de moins de 80 ms sont comblés,
// les bouts de parole de moins de 60 ms ignorés ; une pause compte à partir de minPause.
export function segment(frames, { minPause = 0.3, margin = 12 } = {}) {
  const n = frames.t.length;
  if (!n) return null;
  const sorted = frames.db.slice().sort((a, b) => a - b);
  const floor = percentile(sorted, 0.1);
  const peak = percentile(sorted, 0.98);
  const thr = Math.max(floor + margin, peak - 40);
  const sp = frames.db.map((d, i) => d > thr || (frames.f0[i] > 0 && d > floor + 6));
  const runs = (val) => {
    const out = [];
    let i = 0;
    while (i < n) {
      if (sp[i] !== val) { i++; continue; }
      let j = i;
      while (j < n && sp[j] === val) j++;
      out.push([i, j]);
      i = j;
    }
    return out;
  };
  for (const [a, b] of runs(false)) if (a > 0 && b < n && (b - a) * HOP < 0.08) for (let k = a; k < b; k++) sp[k] = true;
  for (const [a, b] of runs(true)) if ((b - a) * HOP < 0.06) for (let k = a; k < b; k++) sp[k] = false;
  const first = sp.indexOf(true);
  const last = sp.lastIndexOf(true);
  if (first < 0) return { speech: false, floor, thr };
  const pauses = runs(false)
    .filter(([a, b]) => a > first && b <= last && (b - a) * HOP >= minPause)
    .map(([a, b]) => ({ at: frames.t[a] - frames.t[first], dur: (b - a) * HOP }));
  const dur = (last - first + 1) * HOP;
  const paused = pauses.reduce((s, p) => s + p.dur, 0);
  return { speech: true, first, last, dur, pauses, speakTime: dur - paused, floor, thr, mask: sp };
}

// Mélodie en demi-tons : médiane, étendue (10e à 90e centile) et fin de phrase
// (écart entre le début et la fin des 400 dernières millisecondes voisées).
export function melody(frames, seg) {
  const pts = [];
  for (let i = seg.first; i <= seg.last; i++) if (frames.f0[i] > 0) pts.push({ t: frames.t[i], m: hzToMidi(frames.f0[i]) });
  if (pts.length < 5) return null;
  const ms = pts.map((p) => p.m).sort((a, b) => a - b);
  const median = percentile(ms, 0.5);
  const range = percentile(ms, 0.9) - percentile(ms, 0.1);
  const end = pts[pts.length - 1].t;
  const tail = pts.filter((p) => p.t >= end - 0.4);
  let ending = null;
  if (tail.length >= 6) {
    const k = Math.max(2, Math.round(tail.length / 4));
    const avg = (a) => a.reduce((s, p) => s + p.m, 0) / a.length;
    const delta = avg(tail.slice(-k)) - avg(tail.slice(0, k));
    ending = { delta, kind: delta > 1.5 ? 'montante' : delta < -1.5 ? 'descendante' : 'plate' };
  }
  return { median, range, ending, pts };
}

// Toutes les mesures d'une prise.
export function measure(frames, text, opts) {
  const seg = segment(frames, opts);
  if (!seg || !seg.speech) return { speech: false };
  const syl = textSyllables(text);
  const dbs = [];
  for (let i = seg.first; i <= seg.last; i++) if (seg.mask[i]) dbs.push(frames.db[i]);
  dbs.sort((a, b) => a - b);
  return {
    speech: true,
    dur: seg.dur,
    speakTime: seg.speakTime,
    pauses: seg.pauses,
    syllables: syl,
    rate: seg.speakTime > 0 ? syl / seg.speakTime : NaN,
    melody: melody(frames, seg),
    volumeRange: percentile(dbs, 0.9) - percentile(dbs, 0.1),
    seg,
  };
}
