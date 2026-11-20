import { hzToMidi, midiToHz } from './notes.js';

export function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// frames : { t: [], f0: [], db: [] } (f0 = 0 quand la voix n'est pas voisée)
export function summarize(frames) {
  const n = frames.t.length;
  const mids = [];
  const dbs = [];
  for (let i = 0; i < n; i++) {
    if (frames.f0[i] > 0) {
      mids.push(hzToMidi(frames.f0[i]));
      dbs.push(frames.db[i]);
    }
  }
  mids.sort((a, b) => a - b);
  dbs.sort((a, b) => a - b);
  const med = percentile(mids, 0.5);
  const p10 = percentile(mids, 0.1);
  const p90 = percentile(mids, 0.9);
  return {
    frames: n,
    voicedPct: n ? (mids.length / n) * 100 : 0,
    medianMidi: med,
    medianHz: mids.length ? midiToHz(med) : 0,
    p10Midi: p10,
    p90Midi: p90,
    rangeSt: mids.length ? p90 - p10 : NaN,
    medianDb: percentile(dbs, 0.5),
  };
}

export function fmt(n, digits = 0) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
