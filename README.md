# Voix

Appli web d'entraînement vocal, pensée pour l'iPhone (Safari, ajoutée à l'écran d'accueil).
Tout se passe sur l'appareil : aucun son ne part sur Internet.

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

- `npm test` : détection de hauteur sur signaux synthétiques (Node).
- `node tests/e2e.cjs <voix.wav> <dossier>` et `node tests/e2e-bilan.cjs <voix.wav> <dossier>` : tests de bout en bout
  dans Chromium avec un faux micro
  (fichier créé par `python3 tests/make-test-voice.py <voix.wav>`).

## Mise en ligne (GitHub Pages)

Settings → Pages → Build and deployment → Source : « Deploy from a branch », choisir la branche et le dossier racine, Save.
L'adresse de l'appli s'affiche ensuite en haut de cette page de réglages.
