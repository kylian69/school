// Service worker de Scolaly : application installable, page hors ligne de secours.
// Les appels à l'API ne sont jamais mis en cache. La file d'attente hors ligne de l'émargement
// arrivera avec le module 06 (RG-00-19).
const CACHE = 'scolaly-coquille-v1';
const HORS_LIGNE = '/hors-ligne';
const PRECACHE = [HORS_LIGNE, '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(() => caches.match(HORS_LIGNE)));
});
