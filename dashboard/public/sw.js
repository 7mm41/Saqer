// Sarena Admin service worker: makes the dashboard installable and opens
// instantly. The app shell is cached; API calls always go to the network
// (the dashboard shows live data).
const CACHE = 'sarena-admin-v2';
// The panel's own (secret) address, e.g. /abc123…/: this file is served from it.
const SCOPE = new URL('./', self.location).pathname;
const SHELL = ['', 'manifest.webmanifest', 'icons/icon-192.png', 'logo.png'].map((path) => SCOPE + path);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(SCOPE)) return;
  // Pages: network first (fresh deploys), cache as offline fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(SCOPE)));
    return;
  }
  // Hashed assets: cache first.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })),
  );
});
