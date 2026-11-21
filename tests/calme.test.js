// Tests des calculs de la zone calme (Node, sans navigateur).
import {
  ZONE, WIN, MIN_CENTRE, STEPS, zoneOf, rollingCentres, summarizeCalme, judgeCalme, calmeScore,
} from '../js/calme.js';
import { PhraseCatcher } from '../js/projection.js';
import { hzToMidi, midiToHz } from '../js/notes.js';

let failed = 0;
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'ÉCHEC ') + msg); if (!cond) failed++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const step = (k) => STEPS.find((s) => s.key === k);

// Une phrase parlée synthétique : un centre en Hz et une mélodie de ± amp demi-tons autour
// (une oscillation par seconde de voix).
function phrase(hz, n = 150, amp = 3) {
  const m0 = hzToMidi(hz);
  return Array.from({ length: n }, (_, i) => ({ f0: midiToHz(m0 + amp * Math.sin((2 * Math.PI * i) / 50)), db: -30 }));
}

// Bornes de la zone
check(zoneOf(125) === 'in' && zoneOf(145) === 'in' && zoneOf(135) === 'in', 'zone : 125, 135 et 145 Hz sont dedans');
check(zoneOf(146) === 'high' && zoneOf(124) === 'low' && zoneOf(0) === null, 'zone : 146 Hz au-dessus, 124 Hz en dessous, silence ignoré');

// Le centre glissant suit la médiane, pas chaque syllabe.
{
  const c = rollingCentres(phrase(135, 200, 3));
  check(c.length === 200 - MIN_CENTRE + 1, `un centre par mesure dès ${MIN_CENTRE} mesures (${c.length})`);
  const late = c.slice(WIN);
  check(late.every((h) => near(hzToMidi(h), hzToMidi(135), 1.2)), 'mélodie de ±3 dt : le centre reste à ±1,2 dt de 135 Hz');
}

// Phrase calme : centre dans la zone, mélodie gardée.
{
  const p = summarizeCalme(phrase(135));
  const v = judgeCalme(step('debout'), p);
  check(near(p.hz, 135, 2) && v.ok && v.where === 'in' && !v.flat, `phrase à 135 Hz : réussie (centre ${p.hz.toFixed(1)} Hz, étendue ${p.etendue.toFixed(1)} dt)`);
  check(p.pctZone > 80, `phrase à 135 Hz : ${p.pctZone.toFixed(0)} % du temps dans la zone, malgré ±3 dt de mélodie`);
}

// Voix du bilan 1 debout (162 Hz) : au-dessus.
{
  const p = summarizeCalme(phrase(162.5));
  const v = judgeCalme(step('debout'), p);
  check(!v.ok && v.where === 'high' && p.pctHigh > 90, `phrase à 162 Hz : au-dessus (${p.pctHigh.toFixed(0)} % du temps)`);
}

// Voix trop basse.
{
  const v = judgeCalme(step('debout'), summarizeCalme(phrase(112)));
  check(!v.ok && v.where === 'low', 'phrase à 112 Hz : sous la zone');
}

// Voix plate : centre bon, mais presque pas de mélodie.
{
  const p = summarizeCalme(phrase(135, 150, 0.5));
  const v = judgeCalme(step('debout'), p);
  check(v.ok && v.flat, `voix plate signalée (étendue ${p.etendue.toFixed(1)} dt) sans faire échouer l'étape`);
}

// Phrase qui dérive : commence dans la zone, finit au-dessus.
{
  const fr = [...phrase(135, 100), ...phrase(165, 100)];
  const p = summarizeCalme(fr);
  check(p.pctZone > 30 && p.pctZone < 70 && p.pctHigh > 30, `dérive vers le haut : ${p.pctZone.toFixed(0)} % dans la zone, ${p.pctHigh.toFixed(0)} % au-dessus`);
}

// Trop court : 0,4 s pour une phrase, 4 s pour la parole libre.
check(judgeCalme(step('debout'), summarizeCalme(phrase(135, 20))).short, 'phrase de 0,4 s refusée comme trop courte');
check(judgeCalme(step('libre'), summarizeCalme(phrase(135, 200))).short, 'parole libre de 4 s refusée comme trop courte');
check(!judgeCalme(step('libre'), summarizeCalme(phrase(135, 300))).short, 'parole libre de 6 s acceptée');

// Découpe : la parole libre tolère 2 s de pause ; « J'ai fini » clôt tout de suite.
{
  const c = new PhraseCatcher({ endSilence: step('libre').silence, maxFrames: step('libre').max });
  let out = null;
  for (let i = 0; i < 100; i++) out = c.push({ f0: 135, db: -30 }) || out;
  for (let i = 0; i < 100; i++) out = c.push({ f0: 0, db: -70 }) || out;
  check(out === null, 'parole libre : une pause de 2 s ne coupe pas');
  for (let i = 0; i < 50; i++) out = c.push({ f0: 135, db: -30 }) || out;
  out = c.flush();
  check(out.length === 150, `« J'ai fini » renvoie toute la parole entendue (${out.length} mesures)`);
  const d = new PhraseCatcher();
  for (let i = 0; i < 30; i++) d.push({ f0: 135, db: -30 });
  let o2 = null;
  for (let i = 0; i < 40; i++) o2 = d.push({ f0: 0, db: -70 }) || o2;
  check(o2 && o2.length === 30, 'réglage par défaut inchangé pour l’échelle de projection (0,8 s)');
}

// Score de séance.
{
  const e = (k, hz, n, pctZone, ok) => ({ step: k, standing: step(k).standing, hz, n, pctZone, ok, short: false });
  const essais = [
    e('assis', 132, 120, 100, true),
    e('debout', 160, 100, 0, false),
    e('debout', 140, 100, 90, true), // seul le dernier essai compte
    e('deux', 144, 200, 70, true),
    { step: 'libre', short: true, n: 30 },
    e('libre', 148, 600, 40, false),
    e('aveugle', 142, 100, 80, true),
  ];
  const s = calmeScore(essais);
  check(s.etapes === 5 && s.reussies === 4, `étapes ${s.etapes}, réussies ${s.reussies}`);
  check(near(s.centreDebout, 146, 1), `centre debout pondéré par la durée : ${s.centreDebout.toFixed(1)} Hz`);
  check(near(s.pctZoneDebout, (90 * 100 + 70 * 200 + 40 * 600 + 80 * 100) / 1000, 0.01), `temps dans la zone debout : ${s.pctZoneDebout.toFixed(1)} %`);
  check(near(s.ecartAssisDebout, hzToMidi(s.centreDebout) - hzToMidi(132), 0.001) && s.ecartAssisDebout > 1, `assis → debout : +${s.ecartAssisDebout.toFixed(2)} dt`);
  check(s.aveugle && s.aveugle.ok && s.aveugle.hz === 142, 'passage sans regarder repris dans le score');
  const s0 = calmeScore([e('assis', 132, 120, 100, true)]);
  check(Number.isNaN(s0.centreDebout) && Number.isNaN(s0.ecartAssisDebout), 'sans étape debout : pas de centre debout');
}

check(ZONE.lo === 125 && ZONE.hi === 145, 'zone de la passation : 125 à 145 Hz');

console.log(failed ? `\n${failed} échec(s)` : '\nTout est bon.');
process.exit(failed ? 1 : 0);
