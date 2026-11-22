// Tests des mesures d'une prise de réplique (Node, sans navigateur).
import { syllables, textSyllables, segment, melody, measure, HOP } from '../souffleur/mesures.js';
import { midiToHz } from '../js/notes.js';

let failed = 0;
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'ÉCHEC ') + msg); if (!cond) failed++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Syllabes écrites
const cases = { je: 1, taire: 1, trompé: 2, enfin: 2, pense: 1, savait: 2, ici: 2, bouche: 1, 'qu’': 0, 'l’': 0, monde: 1, vous: 1 };
for (const [w, n] of Object.entries(cases)) check(syllables(w) === n, `syllabes « ${w} » = ${syllables(w)} (attendu ${n})`);
const line = 'Je ne suis pas venu ici pour me taire, mais pour vous dire enfin ce que je pense.';
check(textSyllables(line) === 21, `syllabes de la réplique 1 : ${textSyllables(line)} (attendu 21)`);

// Une prise synthétique : 0,5 s de silence, trois segments de parole séparés par 0,4 s et 0,8 s
// de silence, une pause trop courte (0,1 s) à ne pas compter, puis 0,5 s de silence.
function take({ endSlope = 0 } = {}) {
  const f = { t: [], f0: [], db: [] };
  let t = 0;
  const push = (n, voiced, midi = 50) => {
    for (let i = 0; i < n; i++) {
      f.t.push(+(t).toFixed(3));
      f.f0.push(voiced ? midiToHz(typeof midi === 'function' ? midi(i, n) : midi) : 0);
      f.db.push(voiced ? -28 + (i % 4) : -72 + (i % 3));
      t += HOP;
    }
  };
  push(25, false);
  push(50, true, (i) => 50 + 3 * Math.sin(i / 8)); // 1 s
  push(20, false); // 0,4 s
  push(40, true, 52); // 0,8 s
  push(5, false); // 0,1 s : trop court pour une pause
  push(40, true, 51);
  push(40, false); // 0,8 s
  push(50, true, (i, n) => 50 + (endSlope * i) / n); // 1 s, fin montante ou descendante
  push(25, false);
  return f;
}
const f = take({ endSlope: -8 });
const seg = segment(f);
check(seg.speech && seg.pauses.length === 2, `deux pauses trouvées : ${seg.pauses.map((p) => p.dur.toFixed(2)).join(', ')}`);
check(near(seg.pauses[0].dur, 0.4, 0.05) && near(seg.pauses[1].dur, 0.8, 0.05), 'durées des pauses 0,4 s et 0,8 s');
check(near(seg.dur, 4.9, 0.05), `durée de parole ${seg.dur.toFixed(2)} s (attendu 4,9)`);
check(near(seg.speakTime, 3.7, 0.05), `temps de parole sans les pauses ${seg.speakTime.toFixed(2)} s (attendu 3,7)`);
const mel = melody(f, seg);
check(mel && near(mel.median, 50.5, 1.2), `hauteur médiane ${mel && mel.median.toFixed(1)} (attendu ≈ 50,5)`);
check(mel.ending && mel.ending.kind === 'descendante', `fin de phrase descendante (${mel.ending && mel.ending.delta.toFixed(1)} demi-tons)`);
const up = melody(take({ endSlope: 8 }), segment(take({ endSlope: 8 })));
check(up.ending.kind === 'montante', `fin de phrase montante (${up.ending.delta.toFixed(1)} demi-tons)`);
const flat = melody(take(), segment(take()));
check(flat.ending.kind === 'plate', 'fin de phrase plate');
const m = measure(f, line);
check(near(m.rate, 21 / 3.7, 0.05), `débit ${m.rate.toFixed(2)} syllabes/s (attendu ≈ 5,68)`);
check(near(m.volumeRange, 3, 1.1), `écart de volume ${m.volumeRange.toFixed(1)} dB`);
const silent = { t: [0, 0.02, 0.04], f0: [0, 0, 0], db: [-70, -71, -70] };
check(measure(silent, line).speech === false, 'prise sans voix : rien à mesurer');

console.log(failed ? `${failed} échec(s)` : 'Tout est bon.');
process.exit(failed ? 1 : 0);
