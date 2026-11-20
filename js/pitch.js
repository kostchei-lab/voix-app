// Détection de hauteur : décimation (filtre passe-bas à fenêtre de Blackman)
// puis méthode de McLeod (NSDF + choix du premier pic « clé »).
// Fonctions pures, testables hors navigateur.

export function designLowpass(numTaps, cutoff) {
  // cutoff : fréquence de coupure normalisée à la fréquence d'entrée (0 à 0,5)
  const h = new Float32Array(numTaps);
  const M = numTaps - 1;
  let sum = 0;
  for (let n = 0; n < numTaps; n++) {
    const k = n - M / 2;
    const sinc = k === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * k) / (Math.PI * k);
    const w = M === 0 ? 1 : 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / M) + 0.08 * Math.cos((4 * Math.PI * n) / M);
    h[n] = sinc * w;
    sum += h[n];
  }
  for (let n = 0; n < numTaps; n++) h[n] /= sum;
  return h;
}

export function decimate(x, factor, h, outN, out) {
  const L = h.length;
  for (let i = 0; i < outN; i++) {
    const o = i * factor;
    let s = 0;
    for (let k = 0; k < L; k++) s += h[k] * x[o + k];
    out[i] = s;
  }
  return out;
}

export function rmsDb(x, from = 0, to = x.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  const r = Math.sqrt(s / Math.max(1, to - from));
  return r > 0 ? 20 * Math.log10(r) : -120;
}

// Méthode de McLeod. x : signal (moyenne déjà retirée), sr : fréquence d'échantillonnage.
export function mpm(x, sr, minF, maxF, k, nsdf) {
  const N = x.length;
  const maxLag = Math.min(Math.ceil(sr / minF) + 1, N - 2, nsdf.length - 2);
  const minLag = Math.max(2, Math.floor(sr / maxF));
  let total = 0;
  for (let i = 0; i < N; i++) total += x[i] * x[i];
  if (total <= 1e-10) return { f0: 0, clarity: 0 };

  let m = 2 * total;
  for (let tau = 0; tau <= maxLag + 1; tau++) {
    if (tau > 0) m -= x[N - tau] * x[N - tau] + x[tau - 1] * x[tau - 1];
    let r = 0;
    const lim = N - tau;
    for (let j = 0; j < lim; j++) r += x[j] * x[j + tau];
    nsdf[tau] = m > 1e-12 ? (2 * r) / m : 0;
  }

  // On saute le premier lobe positif (autour de tau = 0), puis on garde
  // le maximum de chaque lobe positif suivant.
  let pos = 1;
  while (pos < maxLag && nsdf[pos] > 0) pos++;
  const peaks = [];
  while (pos < maxLag) {
    while (pos < maxLag && nsdf[pos] <= 0) pos++;
    let cur = -1;
    while (pos < maxLag && nsdf[pos] > 0) {
      if (nsdf[pos] >= nsdf[pos - 1] && nsdf[pos] >= nsdf[pos + 1] && (cur < 0 || nsdf[pos] > nsdf[cur])) cur = pos;
      pos++;
    }
    if (cur >= minLag) peaks.push(cur);
  }
  if (!peaks.length) return { f0: 0, clarity: 0 };

  let highest = 0;
  for (const p of peaks) if (nsdf[p] > highest) highest = nsdf[p];
  const thr = k * highest;
  for (const p of peaks) {
    if (nsdf[p] < thr) continue;
    const a = nsdf[p - 1], b = nsdf[p], c = nsdf[p + 1];
    const den = a - 2 * b + c;
    const d = den !== 0 ? (0.5 * (a - c)) / den : 0;
    const period = p + d;
    const clarity = b - 0.25 * (a - c) * d;
    return { f0: sr / period, clarity: Math.min(1, clarity) };
  }
  return { f0: 0, clarity: 0 };
}

export class PitchTracker {
  constructor(inputRate, { targetRate = 16000, windowMs = 64, minF = 55, maxF = 1100, k = 0.9 } = {}) {
    this.inputRate = inputRate;
    this.factor = Math.max(1, Math.round(inputRate / targetRate));
    this.rate = inputRate / this.factor;
    this.N = Math.round((this.rate * windowMs) / 1000);
    this.h = this.factor > 1 ? designLowpass(16 * this.factor + 1, 0.3 / this.factor) : Float32Array.of(1);
    this.rawLen = (this.N - 1) * this.factor + this.h.length;
    this.minF = minF;
    this.maxF = maxF;
    this.k = k;
    this.dec = new Float32Array(this.N);
    this.nsdf = new Float32Array(Math.ceil(this.rate / minF) + 4);
  }

  // raw : au moins rawLen échantillons ; seuls les rawLen derniers sont utilisés.
  analyze(raw) {
    const off = raw.length - this.rawLen;
    const src = off === 0 ? raw : raw.subarray(off);
    const db = rmsDb(src);
    decimate(src, this.factor, this.h, this.N, this.dec);
    let mean = 0;
    for (let i = 0; i < this.N; i++) mean += this.dec[i];
    mean /= this.N;
    for (let i = 0; i < this.N; i++) this.dec[i] -= mean;
    const r = mpm(this.dec, this.rate, this.minF, this.maxF, this.k, this.nsdf);
    return { f0: r.f0, clarity: r.clarity, db };
  }
}
