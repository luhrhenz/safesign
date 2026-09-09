/*
 * Service worker: makes the app installable and fast on a second visit.
 *
 * The rule that matters: NOTHING under /api is ever cached. A verdict is a
 * safety claim about a live contract, and serving a stale one from disk — after
 * an address has been added to a scam list, say — would be the worst bug this
 * app could have. Only the shell and the icons are cached.
 *
 * Bump CACHE when the shell changes; the old one is deleted on activate.
 */

const CACHE = "safesign-shell-v1";

const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  // Take over straight away rather than waiting for every tab to close.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // A failed precache must not abort the install; the app still works.
      Promise.allSettled(SHELL.map((url) => cache.add(url))),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Verdicts and usage counts always come from the network. No exceptions.
  if (url.pathname.startsWith("/api/")) return;

  // Pages: try the network first so a deploy is picked up immediately, and
  // fall back to the cached shell only when the network is unavailable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  // Static assets are content-hashed by the framework, so a hit is always safe.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
