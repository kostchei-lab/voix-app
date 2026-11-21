# Voix

Appli web d'entraînement vocal, pensée pour l'iPhone (Safari, ajoutée à l'écran d'accueil).
Tout se passe sur l'appareil : aucun son ne part sur Internet.

## Nouveau dans la version 0.4

- **Parole → Zone calme** : parler debout avec la voix du calme. Une courbe de hauteur défile sur fond de bande verte
  (125 à 145 Hz) ; au-dessus, le chiffre de « centre » (médiane de la dernière seconde de voix) et un message dès que
  ce centre sort de la bande, avec un cadre rouge. Cinq étapes : assis, debout, deux phrases, parole libre (20 à 30 s,
  bouton « J'ai fini »), puis « sans regarder ». Verdict par phrase : centre, part du temps dans la zone, étendue de la
  mélodie (alerte si la voix devient plate). Score : centre de la voix debout, temps dans la zone, écart assis → debout,
  avec historique, courbe d'évolution et export JSON.

## Version 0.3

- **Parole** : exercices de prise de parole. Premier exercice : l'**échelle de projection**.
  Une phrase de référence à voix normale, puis des paliers à +2, +4 et +6 dB, avec deux jauges en direct
  (volume par rapport à la référence, hauteur avec une limite à +2 demi-tons), un verdict après chaque phrase,
  et un dernier passage « sans regarder » (jauges masquées). Score de séance : montée de hauteur estimée pour +6 dB
  et pente en cents par dB, gardés sur l'appareil, avec l'historique, une courbe d'évolution et un export JSON.

## Ce que fait la version 0.2

- **Miroir** : la hauteur de ta voix en direct sur une portée (do ré mi, la3 = 440 Hz), le volume en dessous,
  la note et l'écart en cents, et sur les 30 dernières secondes : hauteur médiane, étendue d'intonation, volume.
- **Bilan** : le bilan vocal guidé, étape par étape (consignes et textes à l'écran), chaque prise nommée
  automatiquement, possibilité de refaire ou de passer, questionnaire intégré, envoi de tout en un seul partage.
- **Prises** : enregistrement en WAV 16 bits avec les mesures (toutes les 20 ms), écoute, partage du `.wav` et du `.json`.
- **Micro** : choix de l'entrée, vérification que les traitements automatiques sont coupés, niveaux, crête,
  saturations, bruit de fond.

## Technique

- Capture : `getUserMedia` avec annulation d'écho, réduction de bruit et gain automatique désactivés, AudioWorklet.
- Hauteur : décimation à environ 16 kHz puis méthode de McLeod (NSDF), une analyse toutes les 20 ms sur 64 ms.
  Erreur inférieure à 1 cent sur des voyelles synthétiques de 65 à 784 Hz (`npm test`).
- Hors connexion : service worker, réseau d'abord puis copie locale.

## Tests

- `npm test` : détection de hauteur sur signaux synthétiques, calculs de l'échelle de projection et de la zone calme (Node).
- `node tests/e2e-parole.cjs <silence.wav> <dossier>` : séance complète d'échelle de projection, phrases injectées.
- `node tests/e2e-calme.cjs <silence.wav> <dossier>` : séance complète de zone calme (390 px clair et sombre, 1280 px),
  phrases injectées, rechargement de la page pour vérifier l'historique.
- `node tests/e2e.cjs <voix.wav> <dossier>` et `node tests/e2e-bilan.cjs <voix.wav> <dossier>` : tests de bout en bout
  dans Chromium avec un faux micro
  (fichier créé par `python3 tests/make-test-voice.py <voix.wav>`).

## Mise en ligne (GitHub Pages)

Settings → Pages → Build and deployment → Source : « Deploy from a branch », choisir la branche et le dossier racine, Save.
L'adresse de l'appli s'affiche ensuite en haut de cette page de réglages.
