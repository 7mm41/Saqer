/* صقر ستور — Service Worker (offline-first shell cache) */
var CACHE = "saqer-v1";
var ASSETS = [
  "./", "index.html", "app.html", "admin.html",
  "assets/theme.css", "assets/store.js",
  "icons/favicon.svg", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (u) {
      return c.add(u).catch(function () {});
    }));
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // Never cache cross-origin (fonts CDN etc.) — let the network handle it.
  if (url.origin !== self.location.origin) return;
  // Network-first for documents, cache-first for static assets.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(function () { return caches.match(req).then(function (r) { return r || caches.match("index.html"); }); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (cached) {
    return cached || fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return cached; });
  }));
});
