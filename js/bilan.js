// Bilan guidé : une prise à la fois, nommée automatiquement, puis un seul envoi.
export const BILAN_ID = 'bilan-1';

const PARTS = {
  B: {
    title: 'Voix parlée et prise de parole',
    intro: "Micro DJI. Parle comme d'habitude, sans chercher à « bien » parler : c'est ta voix de tous les jours que l'on mesure.",
  },
  C: {
    title: 'Voix chantée',
    intro: "Debout. Chante sans accompagnement et sans réécouter les chansons avant. Commence sur une note confortable, même plus grave que l'original. Laisse 2 secondes de silence entre deux essais.",
  },
};

export const STEPS = [
  {
    code: 'B1-lecture', part: 'B', title: 'Lecture', dur: '≈ 45 s',
    how: 'En position assise, lis ce texte à voix normale, à ton rythme.',
    read: "La bise et le soleil se disputaient, chacun assurant qu'il était le plus fort, quand ils ont vu un voyageur qui s'avançait, enveloppé dans son manteau. Ils sont tombés d'accord que celui qui arriverait le premier à faire ôter son manteau au voyageur serait regardé comme le plus fort. Alors, la bise s'est mise à souffler de toute sa force, mais plus elle soufflait, plus le voyageur serrait son manteau autour de lui. Finalement, elle renonça à le lui faire ôter. Alors le soleil commença à briller et, au bout d'un moment, le voyageur, réchauffé, ôta son manteau. Ainsi, la bise dut reconnaître que le soleil était le plus fort des deux.",
  },
  { code: 'B2-compter', part: 'B', title: 'Compter', dur: '≈ 15 s', how: 'Compte de 1 à 20, tranquillement.' },
  {
    code: 'B3-mmhmm', part: 'B', title: '« Mm-hmm »', dur: '≈ 10 s',
    how: "Trois « mm-hmm » détendus, comme quand tu approuves quelqu'un au téléphone. Puis : « Mm-hmm, oui, d'accord. »",
  },
  { code: 'B4-libre', part: 'B', title: 'Parole libre', dur: '≈ 1 min', how: "Toujours en position assise, raconte ta journée d'hier, comme à un ami." },
  {
    code: 'B5-discours', part: 'B', title: 'Prise de parole', dur: '≈ 2 min',
    how: 'Debout. Imagine 30 personnes devant toi. Présente ton travail ou un projet comme tu le ferais vraiment, avec tes notes habituelles si tu en utilises.',
    note: 'Retiens ton niveau de stress de 0 à 10 : il est demandé à la fin.',
  },
  {
    code: 'B6-projection', part: 'B', title: 'Échelle de projection', dur: '≈ 20 s',
    how: "Debout. Dis trois fois cette phrase : à quelqu'un à 1 mètre, puis à 4 mètres, puis au fond d'une grande salle. Projette sans crier.",
    read: '« Bonjour à tous, merci d’être venus ce soir. »',
  },
  {
    code: 'B7-nez', part: 'B', title: 'Test du nez pincé', dur: '≈ 40 s',
    how: "Chaque élément deux fois : d'abord normalement, puis en pinçant les deux narines entre le pouce et l'index.",
    list: ['« Le petit chat part à l’école. »', '« Maman mange un melon mûr. »', '« aaa » tenu 3 secondes.'],
  },
  { code: 'C1-confort', part: 'C', title: 'Note confortable', dur: '≈ 20 s', how: 'Chante « la » sur une note confortable pendant 3 secondes. Trois fois, en reprenant ta respiration entre chaque.' },
  { code: 'C2-grave', part: 'C', title: 'Vers le grave', dur: '≈ 20 s', how: "Sirène sur « ou », de ta note confortable jusqu'à la plus grave possible, deux fois. Puis tiens ta note la plus grave 2 secondes." },
  { code: 'C3-aigu', part: 'C', title: "Vers l'aigu", dur: '≈ 20 s', how: 'Même chose vers l’aigu, deux fois. Arrête-toi avant que ça serre. Puis tiens 2 secondes la note la plus haute qui reste confortable.' },
  { code: 'C4-tenue', part: 'C', title: 'Note tenue', dur: '≈ 40 s', how: 'Grande inspiration, puis « a » sur ta note confortable, le plus longtemps possible sans forcer. Deux fois.' },
  { code: 'C5-doux-fort', part: 'C', title: 'Doux, fort, doux', dur: '≈ 15 s', how: 'Une note confortable sur « a » : commence doucement, enfle jusqu’à fort, puis reviens à doux, en 6 secondes environ, sans que la note bouge. Deux fois.' },
  { code: 'C6-anniversaire', part: 'C', title: 'Joyeux anniversaire', dur: '≈ 40 s', how: 'Deux fois en entier, lentement, avec un prénom de ton choix.' },
  { code: 'C7-coup-de-soleil', part: 'C', title: 'Coup de soleil', dur: '≈ 40 s', how: 'Le refrain, de mémoire. Si tu ne le connais pas assez, passe.', optional: true },
  { code: 'C8-regresa', part: 'C', title: 'Regresa a mí', dur: '≈ 40 s', how: 'Le refrain, de mémoire, dans la langue que tu connais. Même consigne.', optional: true },
  { code: 'C9-feuilles-mortes', part: 'C', title: 'Les feuilles mortes', dur: '≈ 1 min', how: 'Si tu la connais : le couplet, presque parlé, puis le refrain. Sinon, passe : on l’apprendra avec l’appli.', optional: true },
  { code: 'Q', part: 'Q', title: 'Questionnaire' },
  { code: 'E', part: 'E', title: 'Envoi' },
];

export const QUESTIONS = [
  'Facultatif : sexe et tranche d’âge, pour situer ta hauteur de voix par rapport aux repères publiés.',
  'Expérience musicale : instrument, chorale, cours de chant ?',
  'Prise de parole : à quelle fréquence, devant combien de personnes ? Qu’est-ce qui te gêne (voix qui monte, qui tremble, fatigue, on te fait répéter, débit…) ?',
  'Au quotidien : fatigue ou enrouement après avoir beaucoup parlé ? Nez souvent bouché, allergies, sinusites ?',
  'Ton stress pendant la prise de parole (B5), de 0 à 10.',
  'Ta justesse ressentie, de 1 à 10, pour chaque chanson chantée (C6 à C9).',
  'Un souci pendant le bilan ?',
];

const TAKES = STEPS.filter((s) => s.part === 'B' || s.part === 'C');
const KEY = 'voix-' + BILAN_ID;

function shortCode(code) {
  return code === 'Q' ? 'Q' : code === 'E' ? '✉' : code.split('-')[0];
}

export function createBilan(ctx) {
  const { engine, store, el, button, clock, toast, startMic, isBluetooth, playPrise, filesForPrise, shareFiles, version } = ctx;
  const root = document.querySelector('#bilanStep');
  const nav = document.querySelector('#bilanNav');

  let state = { index: 0, skipped: [], answers: '' };
  try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* vide */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ } };

  const done = new Map(); // code → prise
  let recTimer = null;
  let levelBar = null;
  let timeEl = null;
  let statusEl = null;

  async function load() {
    try {
      const all = await store.all();
      done.clear();
      for (const p of all) if (p.bilan === BILAN_ID && p.code) done.set(p.code, p);
    } catch (e) { /* lecture impossible : on repart à vide */ }
  }

  function renderNav() {
    nav.replaceChildren(...STEPS.map((s, i) => {
      const li = el('li');
      const b = button(shortCode(s.code), 'nav-chip');
      if (done.has(s.code)) b.classList.add('done');
      if (state.skipped.includes(s.code)) b.classList.add('skipped');
      if (s.code === 'Q' && state.answers.trim()) b.classList.add('done');
      if (i === state.index) b.setAttribute('aria-current', 'step');
      b.setAttribute('aria-label', s.title + (done.has(s.code) ? ', faite' : ''));
      b.addEventListener('click', () => go(i));
      li.append(b);
      return li;
    }));
  }

  // Défilement horizontal seul : ne jamais faire bouger la page sous le doigt.
  function centerNav() {
    const cur = nav.querySelector('[aria-current="step"]');
    if (cur) nav.scrollLeft = cur.offsetLeft - nav.clientWidth / 2 + cur.offsetWidth / 2;
  }

  function go(i) {
    if (engine.recording && engine.recording.meta) return toast('Arrête d’abord la prise en cours.');
    state.index = Math.max(0, Math.min(STEPS.length - 1, i));
    save();
    render();
    const main = document.querySelector('#main');
    if (main) main.scrollTop = 0;
  }

  function render() {
    renderNav();
    centerNav();
    const s = STEPS[state.index];
    if (s.code === 'Q') return renderQuestions();
    if (s.code === 'E') return renderSend();
    renderTake(s);
  }

  function renderTake(s) {
    const first = TAKES.find((t) => t.part === s.part) === s;
    const kids = [el('p', 'step-part', 'Partie ' + s.part + ' · ' + PARTS[s.part].title)];
    if (first) kids.push(el('p', 'hint', PARTS[s.part].intro));
    const head = el('div', 'step-head');
    head.append(el('span', 'code', shortCode(s.code)), el('h2', '', s.title), el('span', 'dur', s.dur));
    kids.push(head, el('p', 'step-how', s.how));
    if (s.read) kids.push(el('p', 'read', s.read));
    if (s.list) {
      const ol = el('ol', 'step-list');
      s.list.forEach((x) => ol.append(el('li', '', x)));
      kids.push(ol);
    }
    if (s.note) kids.push(el('p', 'hint', s.note));

    const lvl = el('div', 'step-level');
    const meter = el('div', 'meter');
    levelBar = el('span');
    meter.append(levelBar);
    timeEl = el('span', 'rec-time');
    lvl.append(meter, timeEl);

    const recording = engine.recording && engine.recording.meta && engine.recording.meta.code === s.code;
    const has = done.get(s.code);
    // Commandes fixées en bas de l'écran : accessibles pendant la lecture d'un long texte.
    const dock = el('div', 'step-dock');
    const rec = button('', 'btn rec' + (recording ? ' on' : '') + (has && !recording ? ' small' : ''));
    rec.id = 'stepRec';
    rec.append(el('span', 'rec-dot'), el('span', '', recording ? 'Arrêter' : has ? 'Refaire' : 'Enregistrer'));
    rec.addEventListener('click', () => toggleRec(s));
    if (has && !recording) {
      const next = button('Suivant', 'btn primary');
      next.id = 'stepNext';
      next.addEventListener('click', () => go(state.index + 1));
      const play = button('Réécouter', 'btn small');
      play.addEventListener('click', () => playPrise(has, play));
      const row = el('div', 'controls');
      row.append(play, rec);
      dock.append(lvl, next, row);
    } else {
      dock.append(lvl, rec);
    }

    const foot = el('div', 'step-foot');
    if (state.index > 0) {
      const prev = button('← Précédent', 'link-btn');
      prev.addEventListener('click', () => go(state.index - 1));
      foot.append(prev);
    }
    if (s.optional && !has) {
      const skip = button('Passer cette chanson', 'link-btn');
      skip.addEventListener('click', () => {
        if (!state.skipped.includes(s.code)) state.skipped.push(s.code);
        go(state.index + 1);
      });
      foot.append(skip);
    }
    kids.push(foot);

    statusEl = el('p', 'hint step-status');
    if (has) statusEl.textContent = 'Prise gardée (' + clock(has.duration) + '). Réécoute-la si tu veux, ou passe à la suivante.';
    else if (!engine.running) statusEl.textContent = 'Le micro s’active au premier enregistrement. Branche le DJI avant.';
    dock.prepend(statusEl);
    kids.push(dock);
    root.replaceChildren(...kids);
  }

  async function toggleRec(s) {
    if (engine.recording) {
      const rec = engine.stopRecording();
      stopTimer();
      await ctx.finishRecording(rec);
      return;
    }
    if (!engine.running) {
      await startMic();
      if (!engine.running) return;
    }
    state.skipped = state.skipped.filter((c) => c !== s.code);
    engine.startRecording({ code: s.code, bilan: BILAN_ID });
    render();
    const info = engine.info();
    if (info && isBluetooth(info.label)) statusEl.textContent = 'Attention : micro Bluetooth. Branche plutôt le DJI pour des mesures fiables.';
    else statusEl.textContent = 'Enregistrement… Touche « Arrêter » à la fin.';
    const t0 = performance.now();
    timeEl.textContent = '0:00';
    recTimer = setInterval(() => { if (timeEl) timeEl.textContent = clock((performance.now() - t0) / 1000); }, 250);
  }

  function stopTimer() {
    clearInterval(recTimer);
    recTimer = null;
  }

  // Appelé par l'appli quand une prise du bilan est enregistrée (ou ratée).
  function onSaved(prise, meta) {
    stopTimer();
    if (prise) done.set(prise.code, prise);
    const s = STEPS[state.index];
    if (s && meta && s.code === meta.code) render();
    else renderNav();
  }

  function renderQuestions() {
    const kids = [el('p', 'step-part', 'Pour finir')];
    const head = el('div', 'step-head');
    head.append(el('span', 'code', 'Q'), el('h2', '', 'Questionnaire'));
    kids.push(head);
    const ol = el('ol', 'questions');
    QUESTIONS.forEach((q) => ol.append(el('li', '', q)));
    kids.push(ol);
    const label = el('label', 'hint', 'Tes réponses, numérotées comme les questions');
    label.htmlFor = 'bilanAnswers';
    const ta = el('textarea');
    ta.id = 'bilanAnswers';
    ta.placeholder = '1. …\n2. …\n3. …';
    ta.value = state.answers;
    ta.addEventListener('input', () => { state.answers = ta.value; save(); });
    ta.addEventListener('change', renderNav);
    kids.push(label, ta);
    const controls = el('div', 'controls');
    const next = button('Suivant', 'btn primary');
    next.addEventListener('click', () => go(state.index + 1));
    controls.append(next);
    const foot = el('div', 'step-foot');
    const prev = button('← Précédent', 'link-btn');
    prev.addEventListener('click', () => go(state.index - 1));
    foot.append(prev);
    kids.push(controls, foot);
    root.replaceChildren(...kids);
  }

  function questionnaireFile() {
    const first = TAKES.map((t) => done.get(t.code)).find(Boolean);
    const lines = [
      'Bilan vocal n°1 — questionnaire',
      'Envoyé le ' + new Date().toLocaleString('fr-FR') + ' · appli Voix ' + version,
      'Micro : ' + ((first && first.device && first.device.label) || 'inconnu'),
      'Prises passées : ' + (state.skipped.join(', ') || 'aucune'),
      '',
      ...QUESTIONS.map((q, i) => (i + 1) + '. ' + q),
      '',
      'Réponses :',
      state.answers.trim() || '(vide)',
      '',
    ];
    return new File([lines.join('\n')], BILAN_ID + '-questionnaire.txt', { type: 'text/plain' });
  }

  function buildFiles(part) {
    const files = [];
    for (const t of TAKES) {
      if (part && t.part !== part) continue;
      const p = done.get(t.code);
      if (p) files.push(...filesForPrise(p));
    }
    if (!part || part === 'B') files.push(questionnaireFile());
    return files;
  }

  function renderSend() {
    const kids = [el('p', 'step-part', 'Dernière étape')];
    const head = el('div', 'step-head');
    head.append(el('span', 'code', '✉'), el('h2', '', 'Envoyer le bilan'));
    kids.push(head);
    const missing = TAKES.filter((t) => !done.has(t.code) && !state.skipped.includes(t.code));
    const count = TAKES.filter((t) => done.has(t.code)).length;
    kids.push(el('p', 'step-how', count + ' prises sur ' + TAKES.length + (state.skipped.length ? ', ' + state.skipped.length + ' passée(s)' : '') + '. Questionnaire ' + (state.answers.trim() ? 'rempli.' : 'vide.')));
    if (missing.length) {
      const p = el('p', 'hint warn', 'Il manque : ' + missing.map((t) => shortCode(t.code) + ' ' + t.title).join(', ') + '. Tu peux envoyer quand même et compléter plus tard.');
      kids.push(p);
    }
    const ol = el('ol', 'step-list');
    ['Touche « Tout envoyer ».', 'Dans le menu de partage, choisis « Enregistrer dans Fichiers », dans un dossier « Bilan 1 ».', 'Dans la conversation avec Claude, joins tous les fichiers de ce dossier.']
      .forEach((x) => ol.append(el('li', '', x)));
    kids.push(ol);
    const controls = el('div', 'controls');
    const all = button('Tout envoyer', 'btn primary');
    all.id = 'bilanSendAll';
    all.disabled = count === 0;
    all.addEventListener('click', async () => {
      const ok = await shareFiles(buildFiles(), 'Bilan vocal n°1');
      if (!ok) fallback.hidden = false;
    });
    controls.append(all);
    kids.push(controls);
    const fallback = el('div', 'step-fallback');
    fallback.hidden = true;
    fallback.append(el('p', 'hint', 'Si l’envoi groupé ne passe pas, envoie en deux fois :'));
    const row = el('div', 'controls');
    for (const part of ['B', 'C']) {
      const b = button('Partie ' + part, 'btn');
      b.addEventListener('click', () => shareFiles(buildFiles(part), 'Bilan vocal n°1, partie ' + part));
      row.append(b);
    }
    fallback.append(row);
    kids.push(fallback);
    const foot = el('div', 'step-foot');
    const prev = button('← Précédent', 'link-btn');
    prev.addEventListener('click', () => go(state.index - 1));
    const show = button('Envoi en deux fois', 'link-btn');
    show.addEventListener('click', () => { fallback.hidden = false; });
    foot.append(prev, show);
    kids.push(foot);
    root.replaceChildren(...kids);
  }

  function tick() {
    if (!levelBar) return;
    const v = engine.running ? Math.max(0, Math.min(1, (engine.lastDb + 70) / 70)) : 0;
    levelBar.style.width = (v * 100).toFixed(1) + '%';
    levelBar.classList.toggle('hot', engine.running && engine.lastDb > -6);
  }

  async function open() {
    await load();
    render();
  }

  return { open, onSaved, tick, buildFiles, state: () => state, done: () => done };
}
