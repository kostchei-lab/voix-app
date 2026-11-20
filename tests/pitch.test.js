// Tests de la détection de hauteur sur des signaux synthétiques.
import { PitchTracker } from '../js/pitch.js';
import { hzToMidi } from '../js/notes.js';

const SR = 48000;

function voice(f0, dur, { formants = [[700, 110], [1200, 120], [2600, 160]], jitter = 0, noise = 0, missingFundamental = false } = {}) {
  // Train d'harmoniques avec pente spectrale et enveloppe de formants : un « a » approximatif.
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = f0 * (1 + jitter * Math.sin(2 * Math.PI * 5.5 * i / SR));
    phase += 2 * Math.PI * f / SR;
    let s = 0;
    for (let h = missingFundamental ? 2 : 1; h * f0 < 7000; h++) {
      const fh = h * f0;
      let gain = 1 / h;
      for (const [fc, bw] of formants) gain *= 1 + 4 / (1 + ((fh - fc) / bw) ** 2);
      s += gain * Math.sin(h * phase);
    }
    out[i] = s;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * 0.3 + noise * (Math.random() * 2 - 1);
  return out;
}

function track(sig) {
  const tr = new PitchTracker(SR);
  const hop = Math.round(SR * 0.02);
  const res = [];
  for (let end = tr.rawLen; end <= sig.length; end += hop) res.push(tr.analyze(sig.subarray(end - tr.rawLen, end)));
  return res;
}

let failures = 0;
function check(name, sig, f0, tolCents = 5) {
  const res = track(sig).slice(3);
  const voiced = res.filter((r) => r.f0 > 0 && r.clarity >= 0.8);
  const errs = voiced.map((r) => Math.abs(hzToMidi(r.f0) - hzToMidi(f0)) * 100).sort((a, b) => a - b);
  const med = errs[errs.length >> 1];
  const p95 = errs[Math.floor(errs.length * 0.95)];
  const ok = voiced.length / res.length > 0.9 && med < tolCents && p95 < tolCents * 3;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${name.padEnd(42)} voisé ${(100 * voiced.length / res.length).toFixed(0)} %  erreur médiane ${med?.toFixed(2)} ¢  p95 ${p95?.toFixed(2)} ¢`);
}

for (const f of [65, 82.4, 110, 146.8, 196, 261.6, 392, 523.3, 784]) check(`voyelle ${f} Hz`, voice(f, 1.5), f);
check('voyelle 110 Hz + bruit', voice(110, 1.5, { noise: 0.02 }), 110);
check('voyelle 220 Hz, fondamentale absente', voice(220, 1.5, { missingFundamental: true }), 220, 8);
check('voyelle 98 Hz, formants « ou »', voice(98, 1.5, { formants: [[300, 80], [800, 100], [2300, 150]] }), 98);

// Silence et bruit : ne doivent pas être voisés.
const silence = new Float32Array(SR);
const noise = new Float32Array(SR).map(() => (Math.random() * 2 - 1) * 0.05);
for (const [name, sig] of [['silence', silence], ['bruit blanc', noise]]) {
  const res = track(sig);
  const v = res.filter((r) => r.f0 > 0 && r.clarity >= 0.8).length / res.length;
  const ok = v < 0.05;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${name.padEnd(42)} voisé ${(100 * v).toFixed(0)} %`);
}

// Coût de calcul
const tr = new PitchTracker(SR);
const sig = voice(150, 2);
const t0 = performance.now();
let count = 0;
for (let end = tr.rawLen; end <= sig.length; end += 960) { tr.analyze(sig.subarray(end - tr.rawLen, end)); count++; }
console.log(`Coût : ${((performance.now() - t0) / count).toFixed(2)} ms par analyse (${count} analyses)`);

if (failures) { console.error(`${failures} échec(s)`); process.exit(1); }
console.log('Tous les tests passent.');
