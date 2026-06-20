// service-worker.js
// Minimal offline cache for Crave Productions PWA.
// Caches ONLY the app shell: /, index.html, manifest.json
// Everything else (Firebase data, images, fonts, CDN libs) goes to the network as normal —
// this file does not interfere with your existing app logic in any way.

const CACHE_NAME = "crave-shell-v1";
const SHELL_FILES = ["/", "/index.html", "/manifest.json"];

// Install: pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: only intercept requests for the app shell files.
// Strategy: network first, fall back to cache if offline.
// Everything else (Firebase, images, fonts, APIs) is left untouched and goes straight to network.
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  const isShellRequest =
    event.request.method === "GET" &&
    requestUrl.origin === self.location.origin &&
    (requestUrl.pathname === "/" ||
      requestUrl.pathname === "/index.html" ||
      requestUrl.pathname === "/manifest.json");

  if (!isShellRequest) {
    return; // let the browser handle it normally — no interference
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
