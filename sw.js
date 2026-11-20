// Fonctionne hors connexion : réseau d'abord, copie locale en secours.
const CACHE = 'voix-0.3.0';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/bilan.js',
  'js/parole.js',
  'js/projection.js',
  'js/audio.js',
  'js/pitch.js',
  'js/notes.js',
  'js/trace.js',
  'js/analysis.js',
  'js/store.js',
  'js/wav.js',
  'js/tap-worklet.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html'))),
  );
});
