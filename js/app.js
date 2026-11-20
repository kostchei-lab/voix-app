import { MicEngine } from './audio.js';
import { Trace } from './trace.js';
import { hzToMidi, midiToHz, noteName, centsOff } from './notes.js';
import { summarize, percentile, fmt } from './analysis.js';
import { encodeWav } from './wav.js';
import * as store from './store.js';
import { createBilan } from './bilan.js';

export const VERSION = '0.2.0';
const VIEWS = ['miroir', 'bilan', 'prises', 'micro'];
const $ = (s) => document.querySelector(s);

// Réglages gardés sur l'appareil
const settings = (() => {
  const d = { notation: 'fr', deviceId: '' };
  try { return Object.assign(d, JSON.parse(localStorage.getItem('voix-reglages') || '{}')); } catch (e) { return d; }
})();
function saveSettings() {
  try { localStorage.setItem('voix-reglages', JSON.stringify(settings)); } catch (e) { /* stockage indisponible */ }
}

const engine = new MicEngine();
const trace = new Trace($('#trace'));
trace.notation = settings.notation;

const ui = {
  app: $('#app'),
  note: $('#note'),
  cents: $('#cents'),
  hz: $('#hz'),
  stMed: $('#stMed'),
  stMedHz: $('#stMedHz'),
  stRange: $('#stRange'),
  stVol: $('#stVol'),
  btnMic: $('#btnMic'),
  btnRec: $('#btnRec'),
  recLabel: $('#recLabel'),
  recTime: $('#recTime'),
  btnReset: $('#btnReset'),
  chip: $('#micChip'),
  stageEmpty: $('#stageEmpty'),
  toast: $('#toast'),
};
$('#version').textContent = VERSION;

let lastVoiced = null;
const rolling = [];
let noiseProbe = null;
let recTimer = null;
let wakeLock = null;
let currentView = 'miroir';

// ---------- Mesures en direct ----------
engine.addEventListener('frame', (e) => {
  const f = e.detail;
  trace.push(f);
  if (f.f0 > 0) {
    const midi = hzToMidi(f.f0);
    lastVoiced = { midi, hz: f.f0, at: performance.now() };
    rolling.push({ t: f.t, midi, db: f.db });
  }
  const cut = f.t - 30;
  let k = 0;
  while (k < rolling.length && rolling[k].t < cut) k++;
  if (k) rolling.splice(0, k);
  if (noiseProbe) noiseProbe.push(f.db);
});

let lastText = 0;
function loop(ts) {
  if (currentView === 'miroir') trace.draw(engine.running);
  if (ts - lastText > 80) {
    lastText = ts;
    renderReadout();
    if (currentView === 'micro') renderLevel();
    if (currentView === 'bilan') bilan.tick();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
setInterval(renderStats, 500);

function renderReadout() {
  const fresh = lastVoiced && performance.now() - lastVoiced.at < 250;
  ui.note.classList.toggle('stale', !fresh);
  if (!lastVoiced) return;
  ui.note.textContent = noteName(lastVoiced.midi, settings.notation);
  const c = centsOff(lastVoiced.midi);
  ui.cents.textContent = (c > 0 ? '+' : c < 0 ? '−' : '±') + Math.abs(c) + ' ¢';
  ui.hz.textContent = fmt(lastVoiced.hz) + ' Hz';
}

function renderStats() {
  if (rolling.length < 15) {
    ui.stMed.textContent = '—';
    ui.stMedHz.textContent = '';
    ui.stRange.textContent = '—';
    ui.stVol.textContent = '—';
    return;
  }
  const mids = rolling.map((r) => r.midi).sort((a, b) => a - b);
  const dbs = rolling.map((r) => r.db).sort((a, b) => a - b);
  const med = percentile(mids, 0.5);
  ui.stMed.textContent = noteName(med, settings.notation);
  ui.stMedHz.textContent = fmt(midiToHz(med)) + ' Hz';
  ui.stRange.textContent = fmt(percentile(mids, 0.9) - percentile(mids, 0.1), 1) + ' dt';
  ui.stVol.textContent = fmt(percentile(dbs, 0.5)) + ' dB';
}

function renderLevel() {
  const bar = $('#levelBar');
  if (!engine.running) {
    bar.style.width = '0';
    $('#levelNow').textContent = '—';
    return;
  }
  const v = Math.max(0, Math.min(1, (engine.lastDb + 70) / 70));
  bar.style.width = (v * 100).toFixed(1) + '%';
  bar.classList.toggle('hot', engine.peakDb > -3);
  $('#levelNow').textContent = 'Niveau ' + fmt(engine.lastDb) + ' dB';
  $('#levelPeak').textContent = 'Crête ' + fmt(engine.peakDb) + ' dB';
  $('#levelClips').textContent = 'Saturations ' + engine.clips;
}

// ---------- Micro ----------
ui.btnMic.addEventListener('click', () => (engine.running ? engine.stop() : startMic()));

async function startMic() {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast("Le micro n'est accessible que sur une adresse https.", true);
    return;
  }
  ui.btnMic.disabled = true;
  ui.btnMic.textContent = 'Ouverture du micro…';
  try {
    await engine.start(settings.deviceId || undefined);
  } catch (err) {
    if (settings.deviceId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
      settings.deviceId = '';
      saveSettings();
      try { await engine.start(); } catch (err2) { micError(err2); }
    } else {
      micError(err);
    }
  } finally {
    ui.btnMic.disabled = false;
    renderMicState();
  }
}

function micError(err) {
  const name = (err && err.name) || 'erreur';
  const msg = name === 'NotAllowedError'
    ? 'Accès au micro refusé. Autorise-le dans le menu « aA » → Réglages du site web → Micro, puis réessaie.'
    : name === 'NotFoundError'
      ? 'Aucun micro trouvé. Branche-le, puis réessaie.'
      : "Impossible d'ouvrir le micro (" + name + ').';
  toast(msg, true);
}

engine.addEventListener('start', () => {
  trace.clear();
  renderMicState();
  renderMicInfo();
  refreshDevices();
  requestWake();
  if (engine.ctx) {
    engine.ctx.onstatechange = () => {
      if (engine.running && engine.ctx.state !== 'running') ui.chip.textContent = 'Micro en pause';
      else renderMicState();
    };
  }
});

engine.addEventListener('stop', async (e) => {
  renderMicState();
  renderMicInfo();
  releaseWake();
  if (e.detail.recording) await finishRecording(e.detail.recording);
  if (e.detail.reason === 'ended') toast("Le micro s'est arrêté : débranché, ou pris par une autre appli.", true);
});

function renderMicState() {
  const on = engine.running;
  ui.app.classList.toggle('live', on);
  ui.btnMic.textContent = on ? 'Couper le micro' : 'Activer le micro';
  ui.btnMic.classList.toggle('primary', !on);
  ui.btnMic.classList.toggle('ghost', on);
  ui.btnRec.hidden = !on;
  ui.btnReset.hidden = !on;
  ui.stageEmpty.hidden = on || trace.frames.length > 0;
  const info = engine.info();
  ui.chip.textContent = info ? info.label + (isBluetooth(info.label) ? ' · Bluetooth' : '') : 'Micro coupé';
  ui.chip.classList.toggle('warn', !!info && isBluetooth(info.label));
}

async function refreshDevices() {
  const sel = $('#deviceSelect');
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  let devs = [];
  try { devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch (e) { return; }
  sel.replaceChildren(new Option('Micro par défaut du système', ''));
  devs.forEach((d, i) => {
    if (d.deviceId === 'default' || d.deviceId === '') return;
    sel.append(new Option(d.label || 'Micro ' + (i + 1), d.deviceId));
  });
  sel.value = devs.some((d) => d.deviceId === settings.deviceId) ? settings.deviceId : '';
}

$('#deviceSelect').addEventListener('change', async (e) => {
  settings.deviceId = e.target.value;
  saveSettings();
  if (engine.running) {
    await engine.stop();
    await startMic();
  }
});

// Micros Bluetooth : son compressé et retraité (bande coupée, volume ajusté
// automatiquement). Mesuré le 20 novembre : AirPods coupés à 11 kHz, Bose à 7 kHz.
const BLUETOOTH = /airpods|bose|beats|buds|bluetooth|headset|mains libres|hands-free/i;
export function isBluetooth(label) {
  return BLUETOOTH.test(label || '');
}

function yn(v) {
  return v === true ? 'activé' : v === false ? 'désactivé' : 'non indiqué';
}

function renderMicInfo() {
  const i = engine.info();
  const rows = i
    ? [
      ['Micro', i.label],
      ['Échantillonnage', fmt(i.sampleRate) + ' Hz'],
      ["Annulation d'écho", yn(i.echoCancellation)],
      ['Réduction de bruit', yn(i.noiseSuppression)],
      ['Gain automatique', yn(i.autoGainControl)],
      ['Canaux', i.channelCount != null ? String(i.channelCount) : 'non indiqué'],
    ]
    : [['Micro', 'coupé']];
  if (i && isBluetooth(i.label)) rows.push(['Attention', 'micro Bluetooth : le son est compressé et retraité. Bon pour écouter, pas pour mesurer. Préfère le DJI.']);
  $('#micInfo').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', '', k), el('dd', k === 'Attention' ? 'warn' : '', v)]));
}

$('#btnNoise').addEventListener('click', async () => {
  if (!engine.running) {
    await startMic();
    if (!engine.running) return;
  }
  const out = $('#noiseResult');
  out.textContent = 'Silence complet pendant 3 secondes…';
  noiseProbe = [];
  await new Promise((r) => setTimeout(r, 3000));
  const vals = noiseProbe.sort((a, b) => a - b);
  noiseProbe = null;
  const med = percentile(vals, 0.5);
  const verdict = med < -65 ? 'très calme' : med < -55 ? 'calme' : med < -45 ? 'un peu bruyant' : 'bruyant, cherche une pièce plus calme';
  out.textContent = 'Bruit de fond : ' + fmt(med) + ' dB (' + verdict + ').';
});

$('#btnPeakReset').addEventListener('click', () => {
  engine.peakDb = -120;
  engine.clips = 0;
  renderLevel();
});

document.querySelectorAll('input[name="notation"]').forEach((r) => {
  r.checked = r.value === settings.notation;
  r.addEventListener('change', () => {
    settings.notation = r.value;
    trace.notation = r.value;
    saveSettings();
    renderStats();
    renderReadout();
  });
});

// ---------- Enregistrement ----------
ui.btnRec.addEventListener('click', async () => {
  if (!engine.recording) {
    engine.startRecording();
    ui.btnRec.classList.add('on');
    ui.recLabel.textContent = 'Arrêter';
    const t0 = performance.now();
    ui.recTime.textContent = '0:00';
    recTimer = setInterval(() => { ui.recTime.textContent = clock((performance.now() - t0) / 1000); }, 250);
  } else {
    await finishRecording(engine.stopRecording());
  }
});

ui.btnReset.addEventListener('click', () => {
  rolling.length = 0;
  trace.clear();
  lastVoiced = null;
  ui.note.textContent = '—';
  ui.cents.textContent = '';
  ui.hz.textContent = '';
  renderStats();
});

async function finishRecording(rec) {
  clearInterval(recTimer);
  recTimer = null;
  ui.btnRec.classList.remove('on');
  ui.recLabel.textContent = 'Enregistrer';
  ui.recTime.textContent = '';
  const meta = rec && rec.meta;
  if (!rec || rec.duration < 0.5) {
    toast('Prise trop courte, non gardée.');
    if (meta) bilan.onSaved(null, meta);
    return null;
  }
  const d = rec.startedAt;
  const prise = {
    id: meta ? meta.bilan + '/' + meta.code : d.toISOString(),
    name: meta ? meta.code : 'Prise du ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    createdAt: d.toISOString(),
    duration: rec.duration,
    sampleRate: rec.sr,
    device: rec.info,
    frames: rec.frames,
    summary: summarize(rec.frames),
    wav: encodeWav(rec.chunks, rec.sr),
    version: VERSION,
  };
  if (meta) {
    prise.bilan = meta.bilan;
    prise.code = meta.code;
  }
  try {
    await store.put(prise);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    toast(meta ? 'Prise ' + meta.code.split('-')[0] + ' gardée (' + clock(rec.duration) + ').' : 'Prise enregistrée (' + clock(rec.duration) + '). Retrouve-la dans Prises.');
    if (currentView === 'prises') renderPrises();
    if (meta) bilan.onSaved(prise, meta);
    return prise;
  } catch (err) {
    toast("Impossible de garder la prise sur l'appareil (" + (err && err.name) + ').', true);
    if (meta) bilan.onSaved(null, meta);
    return null;
  }
}

// ---------- Prises ----------
const player = new Audio();
let playing = { id: null, btn: null, url: null };
player.addEventListener('pause', () => { if (playing.btn) playing.btn.textContent = 'Écouter'; });
player.addEventListener('ended', () => { if (playing.btn) playing.btn.textContent = 'Écouter'; });

async function renderPrises() {
  let list = [];
  try { list = await store.all(); } catch (e) { toast('Lecture des prises impossible.', true); }
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $('#prisesEmpty').hidden = list.length > 0;
  $('#prisesList').replaceChildren(...list.map(priseItem));
}

function priseItem(p) {
  const li = el('li', 'prise');
  const head = el('div', 'prise-head');
  head.append(el('h3', 'prise-name', p.name), el('p', 'prise-meta', [clock(p.duration), p.device && p.device.label].filter(Boolean).join(' · ')));
  const s = p.summary || {};
  const chips = el('ul', 'chips');
  if (s.medianHz) chips.append(el('li', '', 'Médiane ' + noteName(s.medianMidi, settings.notation) + ' · ' + fmt(s.medianHz) + ' Hz'));
  if (Number.isFinite(s.rangeSt)) chips.append(el('li', '', 'Étendue ' + fmt(s.rangeSt, 1) + ' dt'));
  chips.append(el('li', '', 'Voix ' + fmt(s.voicedPct) + ' % du temps'));
  const actions = el('div', 'prise-actions');
  const play = button('Écouter', 'btn small');
  play.addEventListener('click', () => togglePlay(p, play));
  const share = button('Partager', 'btn small');
  share.addEventListener('click', () => sharePrise(p));
  const rename = button('Renommer', 'btn small ghost');
  rename.addEventListener('click', async () => {
    const n = window.prompt('Nom de la prise', p.name);
    if (n && n.trim()) {
      p.name = n.trim();
      await store.put(p);
      renderPrises();
    }
  });
  const del = button('Supprimer', 'btn small ghost danger');
  del.addEventListener('click', async () => {
    if (window.confirm('Supprimer « ' + p.name + ' » ? Elle sera effacée de cet appareil.')) {
      await store.remove(p.id);
      renderPrises();
    }
  });
  actions.append(play, share, rename, del);
  li.append(head, chips, actions);
  return li;
}

async function togglePlay(p, btn) {
  if (playing.id === p.id && !player.paused) {
    player.pause();
    return;
  }
  if (engine.running) {
    await engine.stop();
    toast("Micro coupé pendant l'écoute.");
  }
  if (playing.url) URL.revokeObjectURL(playing.url);
  if (playing.btn && playing.btn !== btn) playing.btn.textContent = 'Écouter';
  playing = { id: p.id, btn, url: URL.createObjectURL(p.wav) };
  player.src = playing.url;
  try {
    await player.play();
    btn.textContent = 'Pause';
  } catch (e) {
    toast('Lecture impossible.', true);
  }
}

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'prise';
}

function exportJson(p) {
  return {
    app: 'voix',
    version: p.version,
    nom: p.name,
    date: p.createdAt,
    duree: +p.duration.toFixed(2),
    echantillonnage: p.sampleRate,
    micro: p.device,
    resume: p.summary,
    mesures: { pas: 0.02, t: p.frames.t, f0: p.frames.f0, db: p.frames.db, clarte: p.frames.c },
  };
}

function filesForPrise(p) {
  const base = slug(p.name);
  return [
    new File([p.wav], base + '.wav', { type: 'audio/wav' }),
    new File([JSON.stringify(exportJson(p))], base + '.json', { type: 'application/json' }),
  ];
}

// Partage : menu de partage du système, sinon téléchargement. Renvoie false si ça a échoué.
async function shareFiles(files, title) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return true;
      toast('Partage impossible (' + e.name + ').', true);
      return false;
    }
  }
  try {
    for (const f of files) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }
    return true;
  } catch (e) {
    toast('Partage impossible.', true);
    return false;
  }
}

async function sharePrise(p) {
  await shareFiles(filesForPrise(p), p.name);
}

const bilan = createBilan({
  engine, store, el, button, clock, toast, startMic, isBluetooth,
  playPrise: togglePlay, filesForPrise, shareFiles, finishRecording, version: VERSION,
});

// ---------- Navigation ----------
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));

function show(name) {
  if (!VIEWS.includes(name)) name = 'miroir';
  currentView = name;
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== name; });
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === name ? 'page' : 'false'));
  if (name === 'prises') renderPrises();
  if (name === 'bilan') bilan.open();
  if (name === 'micro') { renderMicInfo(); refreshDevices(); renderLevel(); }
  if (name === 'miroir') requestAnimationFrame(() => trace.resize());
  try { history.replaceState(null, '', '#' + name); } catch (e) { /* sans effet */ }
}
show((location.hash || '#miroir').slice(1));
renderMicInfo();

// ---------- Écran allumé, retour au premier plan ----------
async function requestWake() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
}
function releaseWake() {
  try { if (wakeLock) wakeLock.release(); } catch (e) { /* déjà libéré */ }
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !engine.running) return;
  requestWake();
  if (engine.ctx && engine.ctx.state !== 'running') engine.ctx.resume().catch(() => {});
});

// ---------- Utilitaires ----------
function clock(sec) {
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function button(text, cls) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}
let toastTimer = null;
function toast(msg, isError = false) {
  ui.toast.textContent = msg;
  ui.toast.classList.toggle('error', isError);
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, isError ? 6000 : 3500);
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Accès pour les tests automatisés
window.__voix = { engine, store, bilan, VERSION };
