// service-worker.js
// PWA service worker for Crave Productions.
// Scope: "/" (root) — must be served from the site root for Chrome's
// installability scope check to pass.
//
// Caches ONLY the app shell. All other requests (Firebase, fonts, CDN
// libraries, images) pass straight through to the network untouched —
// this does not change any existing app behavior.

const CACHE_VERSION = "crave-shell-v2";
const SHELL_FILES = [
  "/",
  "/index.html",
  "/manifest.json"
];

// ---- INSTALL ----
// Pre-cache the app shell. Each file is added individually (not addAll)
// so that one failed fetch doesn't abort the whole install step —
// this is what most commonly causes a service worker to silently fail
// to activate.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return Promise.all(
        SHELL_FILES.map((file) =>
          fetch(file)
            .then((res) => {
              if (res.ok) return cache.put(file, res);
              console.warn("[SW] Skipped caching (bad response):", file, res.status);
            })
            .catch((err) => {
              console.warn("[SW] Skipped caching (fetch failed):", file, err);
            })
        )
      );
    })
  );
  // Activate this worker immediately instead of waiting for old one to be replaced
  self.skipWaiting();
});

// ---- ACTIVATE ----
// Clean up old cache versions and take control of all open clients right away.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ---- FETCH ----
// Only intercept GET requests for the app shell files (network-first,
// cache fallback for offline support). Everything else is left
// completely untouched and goes straight to the network as normal.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isShellRequest =
    url.origin === self.location.origin &&
    (url.pathname === "/" ||
      url.pathname === "/index.html" ||
      url.pathname === "/manifest.json");

  if (!isShellRequest) return; // let the browser/network handle everything else

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const clone = networkResponse.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
