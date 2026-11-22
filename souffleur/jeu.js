// Souffleur, phase 1 « travailler le jeu » : lecture de Claude et mesures de chaque prise.
import { MicEngine } from '../js/audio.js';
import { encodeWav } from '../js/wav.js';
import { measure } from './mesures.js';

const KEY = 'souffleur-jeu-v1';
const MAX_TAKE_S = 60;
const PROMPT = `Annote cette scène pour l’appli Souffleur. Garde le texte exact, sans rien ajouter d’autre.
Format :
# Titre de la scène
@moi NOM DE MON PERSONNAGE
NOM : réplique (une réplique par ligne)
Dans mes répliques seulement : mets entre astérisques les mots à appuyer (*mot*) et marque les respirations par une barre oblique entourée d’espaces ( / ).
Sous chacune de mes répliques, ajoute deux lignes :
> intention : (une phrase)
> conseil : (une phrase, concrète)
Voici la scène :`;
// Scène d'exemple, écrite pour l'appli (sans droits), annotée comme le ferait Claude.
const EXAMPLE = `# Le retour (scène d’exemple)
@moi PAUL
CLAIRE : Alors, qu’avez-vous à me dire ?
PAUL : Je ne suis pas venu ici / pour me *taire*, / mais pour vous dire *enfin* / ce que je pense.
> intention : Il a longtemps retenu ces mots ; il ouvre la vanne, mais garde le contrôle.
> conseil : Laisse un vrai temps avant « mais » : « enfin » porte toute l’attente.
CLAIRE : Eh bien ? Parlez donc !
PAUL : Vous m’avez *trompé*, / et tout le monde le savait, / sauf *moi*.
> intention : La blessure plus que la colère.
> conseil : Ne monte pas en force sur « trompé » ; baisse la voix sur « sauf moi », comme un aveu.
CLAIRE : Et que voulez-vous que j’y fasse, maintenant ?
PAUL : Rien. / Je voulais seulement / que vous l’entendiez / de *ma* bouche.
> intention : Il reprend sa dignité ; il n’attend plus de réponse.
> conseil : Finis en descendant : si « bouche » monte, on entendra une question.`;

// ---------- Scène : lecture du format ----------
export function parseScene(raw) {
  const sc = { title: 'Scène sans titre', me: null, lines: [] };
  for (const l of raw.replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean)) {
    const last = sc.lines[sc.lines.length - 1];
    if (l.startsWith('#')) sc.title = l.replace(/^#+\s*/, '');
    else if (/^@moi\s+/i.test(l)) sc.me = l.replace(/^@moi\s+/i, '').trim().toUpperCase();
    else if (l.startsWith('>')) {
      if (!last) continue;
      const m = l.slice(1).trim().match(/^([^:]{1,24}?)\s*:\s*(.+)$/);
      last.notes.push(m ? { k: m[1].trim(), v: m[2].trim() } : { k: '', v: l.slice(1).trim() });
    } else {
      const m = l.match(/^([^:«»]{1,30}?)\s*:\s*(.+)$/);
      if (m && m[1].trim().split(/\s+/).length <= 3) sc.lines.push({ who: m[1].trim(), text: m[2].trim(), notes: [] });
      else if (last) last.text += ' ' + l;
    }
  }
  if (!sc.me) {
    const withNotes = sc.lines.find((x) => x.notes.length);
    const pick = withNotes || sc.lines[1] || sc.lines[0];
    sc.me = pick ? pick.who.toUpperCase() : null;
  }
  sc.lines.forEach((x) => { x.mine = x.who.toUpperCase() === sc.me; });
  return sc;
}
const plain = (t) => t.replace(/\*/g, '').replace(/\s\/(?=\s|$)/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function marked(t) {
  return esc(t)
    .replace(/\*([^*]+)\*/g, '<span class="stress">$1</span>')
    .replace(/(^|\s)\/(?=\s|$)/g, '$1<span class="breath" title="respiration">‖</span>');
}
const breaths = (t) => (t.match(/(^|\s)\/(?=\s|$)/g) || []).length;

// ---------- Mémoire (sur l'iPhone seulement ; les sons ne sont gardés que le temps de la page) ----------
let db = { scenes: [{ id: 'exemple', raw: EXAMPLE }], takes: {} };
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s && Array.isArray(s.scenes)) db = Object.assign({ takes: {} }, s);
} catch (e) { /* mémoire indisponible */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* idem */ } };

// ---------- Affichage ----------
const $ = (id) => document.getElementById(id);
const num = (n, d = 1) => (Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
function show(id) { for (const s of ['home', 'import', 'scene']) $(s).hidden = s !== id; window.scrollTo(0, 0); }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function renderList() {
  const box = $('list');
  box.replaceChildren();
  for (const s of db.scenes) {
    const sc = parseScene(s.raw);
    const b = el('button', 'scene-card');
    const mine = sc.lines.filter((x) => x.mine).length;
    b.append(el('span', 't', sc.title), el('span', 'a', `${sc.me || '?'} · ${mine} réplique${mine > 1 ? 's' : ''} à toi`));
    b.addEventListener('click', () => openScene(s.id));
    box.append(b);
  }
}

$('addBtn').addEventListener('click', () => { $('raw').value = ''; $('imMsg').textContent = ''; $('copied').textContent = ''; show('import'); });
$('imBack').addEventListener('click', () => show('home'));
$('prompt').textContent = PROMPT;
$('copyPrompt').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(PROMPT); $('copied').textContent = 'Copié.'; }
  catch (e) {
    const r = document.createRange(); r.selectNodeContents($('prompt'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    $('copied').textContent = 'Texte sélectionné : touche « Copier ».';
  }
});
$('imSave').addEventListener('click', () => {
  const raw = $('raw').value.trim();
  const sc = parseScene(raw);
  if (!sc.lines.length) { $('imMsg').textContent = 'Je ne trouve aucune réplique (« NOM : texte »).'; return; }
  if (!sc.lines.some((x) => x.mine)) { $('imMsg').textContent = 'Je ne sais pas quel est ton personnage : ajoute une ligne « @moi NOM ».'; return; }
  const s = { id: 's' + Date.now().toString(36), raw };
  db.scenes.push(s);
  save();
  renderList();
  openScene(s.id);
});

// ---------- Une scène ----------
let current = null;
function openScene(id) {
  const s = db.scenes.find((x) => x.id === id);
  if (!s) return;
  current = { s, sc: parseScene(s.raw) };
  $('scTitle').textContent = current.sc.title;
  $('scRole').textContent = 'Ton personnage : ' + current.sc.me;
  $('micMsg').textContent = '';
  const box = $('dialogue');
  box.replaceChildren();
  current.sc.lines.forEach((line, i) => {
    if (!line.mine) {
      const p = el('p', 'partner');
      p.append(el('span', 'who', line.who + ' '), document.createTextNode(plain(line.text)));
      box.append(p);
      return;
    }
    const c = el('div', 'card mine');
    c.id = 'line-' + i;
    c.append(el('span', 'who', line.who));
    const t = el('div', 'text');
    t.innerHTML = marked(line.text);
    c.append(t);
    if (line.notes.length) {
      const n = el('div', 'notes');
      for (const x of line.notes) {
        const p = el('p');
        if (x.k) p.append(el('b', null, x.k.charAt(0).toUpperCase() + x.k.slice(1) + ' : '));
        p.append(document.createTextNode(x.v));
        n.append(p);
      }
      c.append(n);
    }
    const row = el('div', 'row');
    const btn = el('button', 'rec', 'Enregistrer');
    btn.setAttribute('aria-pressed', 'false');
    const lvl = el('div', 'level'); lvl.append(el('i')); lvl.hidden = true;
    row.append(btn, lvl);
    const res = el('div', 'result'); res.hidden = true;
    c.append(row, res);
    btn.addEventListener('click', () => toggleTake(i, line, btn, lvl, res));
    box.append(c);
    const prev = (db.takes[`${s.id}:${i}`] || []).slice(-1)[0];
    if (prev) { res.hidden = false; res.append(el('p', 'prev', 'Dernière prise : ' + summary(prev))); }
  });
  show('scene');
}
$('scBack').addEventListener('click', async () => { await stopTake(); show('home'); renderList(); });
$('delBtn').addEventListener('click', async () => {
  if (!current || !confirm(`Supprimer « ${current.sc.title} » ?`)) return;
  await stopTake();
  db.scenes = db.scenes.filter((x) => x !== current.s);
  for (const k of Object.keys(db.takes)) if (k.startsWith(current.s.id + ':')) delete db.takes[k];
  save();
  renderList();
  show('home');
});

// ---------- Prises ----------
const mic = new MicEngine();
let take = null; // { i, line, btn, lvl, res, timer, t0 }
mic.addEventListener('frame', (e) => {
  if (!take) return;
  const d = e.detail.db;
  take.lvl.firstChild.style.width = Math.max(0, Math.min(100, (d + 70) * 1.6)) + '%';
});

async function toggleTake(i, line, btn, lvl, res) {
  if (take && take.i === i) { await stopTake(); return; }
  await stopTake();
  btn.disabled = true;
  $('micMsg').textContent = '';
  try { await mic.start(); }
  catch (e) {
    btn.disabled = false;
    $('micMsg').textContent = 'Le micro n’est pas accessible : autorise-le dans les réglages de Safari, puis réessaie.';
    return;
  }
  mic.startRecording({ line: i });
  take = { i, line, btn, lvl, res, t0: performance.now() };
  btn.disabled = false;
  btn.setAttribute('aria-pressed', 'true');
  lvl.hidden = false;
  const tick = () => {
    if (!take || take.btn !== btn) return;
    const s = (performance.now() - take.t0) / 1000;
    btn.textContent = `Arrêter (${Math.floor(s)} s)`;
    if (s >= MAX_TAKE_S) { stopTake(); return; }
    take.timer = setTimeout(tick, 250);
  };
  tick();
}

async function stopTake() {
  if (!take) return;
  const t = take;
  take = null;
  clearTimeout(t.timer);
  const rec = mic.stopRecording();
  await mic.stop();
  t.btn.textContent = 'Enregistrer';
  t.btn.setAttribute('aria-pressed', 'false');
  t.lvl.hidden = true;
  if (rec) showResult(t, rec);
}

function summary(m) {
  if (!m.speech) return 'pas de voix entendue';
  return `${num(m.rate)} syllabes/s, ${m.pauses} pause${m.pauses > 1 ? 's' : ''}, mélodie ${num(m.range, 0)} demi-tons, fin ${m.ending || '—'}`;
}

function showResult(t, rec) {
  const key = `${current.s.id}:${t.i}`;
  const text = plain(t.line.text);
  const m = measure(rec.frames, text);
  const res = t.res;
  res.replaceChildren();
  res.hidden = false;
  const hist = db.takes[key] || (db.takes[key] = []);
  const prev = hist[hist.length - 1];
  if (!m.speech) {
    res.append(el('p', 'warn', 'Je n’ai pas entendu ta voix. Rapproche-toi du micro et réessaie.'));
    return;
  }
  const canvas = el('canvas');
  res.append(canvas);
  const st = el('dl', 'stats');
  const add = (k, v, sub) => { const d = el('div'); const dd = el('dd', null, v); if (sub) dd.append(el('small', null, sub)); d.append(el('dt', null, k), dd); st.append(d); };
  const want = breaths(t.line.text);
  add('Débit', `${num(m.rate)} syllabes/s`, `≈ ${m.syllables} syllabes en ${num(m.speakTime)} s de parole`);
  add('Pauses', `${m.pauses.length}` + (m.pauses.length ? ` (${m.pauses.map((p) => num(p.dur)).join(' ; ')} s)` : ''), want ? `Claude propose ${want} respiration${want > 1 ? 's' : ''}` : '');
  const mel = m.melody;
  add('Mélodie', mel ? `${num(mel.range, 0)} demi-tons` : '—', mel && mel.ending ? `fin ${mel.ending.kind} (${mel.ending.delta > 0 ? '+' : ''}${num(mel.ending.delta)} demi-ton${Math.abs(mel.ending.delta) >= 2 ? 's' : ''})` : 'fin : pas assez de voix pour juger');
  add('Volume', `écart de ${num(m.volumeRange, 0)} dB`, `durée totale ${num(m.dur)} s`);
  res.append(st);
  const entry = { date: new Date().toISOString(), speech: true, rate: m.rate, pauses: m.pauses.length, range: mel ? mel.range : NaN, ending: mel && mel.ending ? mel.ending.kind : null, dur: m.dur, volumeRange: m.volumeRange };
  if (prev) res.append(el('p', 'prev', 'Prise précédente : ' + summary(prev)));
  hist.push(entry);
  if (hist.length > 10) hist.splice(0, hist.length - 10);
  save();
  const audio = el('audio');
  audio.controls = true;
  audio.preload = 'auto';
  audio.src = URL.createObjectURL(encodeWav(rec.chunks, rec.sr));
  res.append(audio);
  requestAnimationFrame(() => draw(canvas, rec.frames, m));
}

// Courbe : hauteur en demi-tons autour de ta médiane, volume en fond, pauses en bandes.
function draw(canvas, f, m) {
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim();
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const seg = m.seg;
  const t0 = f.t[seg.first] - 0.2, t1 = f.t[seg.last] + 0.2;
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  g.fillStyle = col('--pause');
  for (const p of m.pauses) g.fillRect(x(f.t[seg.first] + p.at), 0, (p.dur / (t1 - t0)) * W, H);
  g.fillStyle = col('--vol');
  const bw = Math.max(1, (0.02 / (t1 - t0)) * W);
  for (let i = seg.first; i <= seg.last; i++) {
    const h = Math.max(0, Math.min(1, (f.db[i] - seg.floor) / 50)) * H * 0.45;
    g.fillRect(x(f.t[i]), H - h, bw, h);
  }
  const mel = m.melody;
  g.strokeStyle = col('--line'); g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  if (!mel) return;
  const y = (mm) => H / 2 - (Math.max(-8, Math.min(8, mm - mel.median)) / 8) * (H / 2 - 8);
  let prevT = -1;
  g.strokeStyle = col('--curve'); g.lineWidth = 2.5; g.lineJoin = 'round';
  g.beginPath();
  for (const p of mel.pts) {
    const yy = y(p.m);
    if (p.t - prevT > 0.05) g.moveTo(x(p.t), yy); else g.lineTo(x(p.t), yy);
    prevT = p.t;
  }
  g.stroke();
  g.fillStyle = col('--muted'); g.font = '12px -apple-system, system-ui, sans-serif';
  g.fillText('aigu', 6, 14); g.fillText('grave', 6, H - 6);
}

renderList();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
