// Tests des calculs de l'échelle de projection (Node, sans navigateur).
import { PhraseCatcher, summarizePhrase, judge, sessionScore, STEPS, END_SILENCE } from '../js/projection.js';
import { midiToHz, hzToMidi } from '../js/notes.js';

let failed = 0;
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'ÉCHEC ') + msg); if (!cond) failed++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const step = (k) => STEPS.find((s) => s.key === k);

// Une phrase synthétique : n mesures voisées, puis du silence.
function phrase(hz, db, n = 100) {
  const c = new PhraseCatcher();
  let out = null;
  for (let i = 0; i < 20; i++) out = c.push({ f0: 0, db: -70 }) || out; // silence avant
  for (let i = 0; i < n; i++) out = c.push({ f0: hz * (1 + 0.01 * Math.sin(i / 5)), db: db + (i % 3) - 1 }) || out;
  for (let i = 0; i < END_SILENCE + 5; i++) out = c.push({ f0: 0, db: -70 }) || out;
  return out;
}

// Découpe : un trou de 0,4 s ne coupe pas la phrase, 0,8 s la termine.
{
  const c = new PhraseCatcher();
  let out = null;
  for (let i = 0; i < 50; i++) out = c.push({ f0: 150, db: -30 }) || out;
  for (let i = 0; i < 20; i++) out = c.push({ f0: 0, db: -70 }) || out;
  check(out === null, 'une pause de 0,4 s ne termine pas la phrase');
  for (let i = 0; i < 50; i++) out = c.push({ f0: 150, db: -30 }) || out;
  for (let i = 0; i < END_SILENCE; i++) out = c.push({ f0: 0, db: -70 }) || out;
  check(out && out.length === 100, `phrase complète après 0,8 s de silence (${out && out.length} mesures voisées)`);
}

const ref = summarizePhrase(phrase(150, -30));
check(near(ref.hz, 150, 1.5) && near(ref.db, -30, 0.6), `référence : ${ref.hz.toFixed(1)} Hz, ${ref.db.toFixed(1)} dB`);

const up = (st) => midiToHz(hzToMidi(150) + st);

// Palier +4 dB réussi : +4,2 dB et +1 dt.
let p = summarizePhrase(phrase(up(1), -25.8));
let v = judge(step('p4'), p, ref);
check(v.ok && near(v.gainDb, 4.2, 0.6) && near(v.riseSt, 1, 0.1), `palier +4 réussi (gain ${v.gainDb.toFixed(1)} dB, montée ${v.riseSt.toFixed(2)} dt)`);

// Palier +6 dB : volume atteint mais hauteur trop haute.
p = summarizePhrase(phrase(up(3.5), -24));
v = judge(step('p6'), p, ref);
check(!v.ok && v.volOk && !v.pitchOk, 'palier +6 refusé : la hauteur dépasse +2 dt');

// Palier +6 dB : hauteur bonne mais volume insuffisant (+4 dB).
p = summarizePhrase(phrase(up(0.5), -26));
v = judge(step('p6'), p, ref);
check(!v.ok && !v.volOk && v.pitchOk, 'palier +6 refusé : volume insuffisant');

// Voix écrasée vers le grave.
p = summarizePhrase(phrase(up(-4), -24));
v = judge(step('p6'), p, ref);
check(v.tooLow, 'alerte voix écrasée sous −3 dt');

// Phrase trop courte.
v = judge(step('p2'), summarizePhrase(phrase(150, -28, 10)), ref);
check(v.short && !v.ok, 'phrase de 0,2 s refusée comme trop courte');

// Score : pente de 50 cents par dB → +3 dt à +6 dB.
const essais = [
  { step: 'ref', gainDb: 0, riseSt: 0 },
  { step: 'p2', gainDb: 2, riseSt: 1, ok: true },
  { step: 'p4', gainDb: 4, riseSt: 2, ok: true },
  { step: 'p6', gainDb: 5, riseSt: 4, ok: false },
  { step: 'p6', gainDb: 6, riseSt: 3, ok: false }, // seul le dernier essai compte
  { step: 'aveugle', gainDb: 6, riseSt: 3, ok: false },
];
const s = sessionScore(essais);
check(s.fiable && near(s.penteCentsParDb, 50, 0.01) && near(s.monteeA6, 3, 0.01), `pente ${s.penteCentsParDb.toFixed(1)} c/dB, montée à +6 dB ${s.monteeA6.toFixed(2)} dt`);
check(s.paliers === 4 && s.reussis === 2, `paliers retenus ${s.paliers}, réussis ${s.reussis}`);
check(s.aveugle && s.aveugle.riseSt === 3, 'passage sans regarder repris dans le score');

// Pas assez d'écart de volume : pas de pente.
const s2 = sessionScore([{ step: 'p2', gainDb: 1, riseSt: 0.5, ok: false }, { step: 'p4', gainDb: 2, riseSt: 0.5, ok: false }]);
check(!s2.fiable && Number.isNaN(s2.monteeA6), 'pente non calculée si le volume monte de moins de 3 dB');

console.log(failed ? `\n${failed} échec(s)` : '\nTout est bon.');
process.exit(failed ? 1 : 0);
