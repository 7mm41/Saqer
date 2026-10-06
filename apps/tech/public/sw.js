/* Katf technician PWA service worker.
 * - App shell: hashed assets are cached on first use; navigations are network-first with the cached shell as fallback.
 * - Never caches /api (personal data and money must always be fresh).
 * - Shows push notifications and opens the job when tapped.
 */
const VERSION = 'katf-tech-v1';
const SCOPE = self.registration.scope; // e.g. https://host/tech/
const SHELL = new URL('index.html', SCOPE).toString();

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([SHELL, new URL('manifest.webmanifest', SCOPE).toString(), new URL('icon.svg', SCOPE).toString()])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) void caches.open(VERSION).then((c) => c.put(SHELL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL).then((r) => r || Response.error())),
    );
    return;
  }
  if (url.href.startsWith(SCOPE)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && /\/assets\//.test(url.pathname)) {
              const copy = res.clone();
              void caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener('push', (e) => {
  let msg = { title: 'كتف', body: '', link: null, urgent: false };
  try {
    msg = Object.assign(msg, e.data ? e.data.json() : {});
  } catch {
    /* keep defaults */
  }
  e.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      lang: 'ar',
      dir: 'auto',
      icon: new URL('icons/icon-192.png', SCOPE).toString(),
      badge: new URL('icons/icon-192.png', SCOPE).toString(),
      tag: msg.link || undefined,
      renotify: Boolean(msg.urgent),
      requireInteraction: Boolean(msg.urgent),
      vibrate: msg.urgent ? [300, 120, 300, 120, 300] : [120],
      data: { link: msg.link },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.link) || new URL('home', SCOPE).toString();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(SCOPE) && 'focus' in c) {
          void c.navigate(target);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
