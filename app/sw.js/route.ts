/**
 * The service worker, served from a route so its cache name carries the build.
 *
 * This used to be a static file with a hand-written version string and a
 * comment telling me to bump it whenever the shell changed. I redesigned the
 * whole interface and did not bump it, so every returning visitor kept being
 * served the previous build's HTML — which pointed at the previous build's
 * CSS, which was itself cached as an immutable asset. The deploy was live and
 * correct, and looked like nothing had happened.
 *
 * Deriving the cache name from the deploy makes that failure impossible: a new
 * build is a new cache, the old one is deleted on activate, and the worker's
 * own bytes change so browsers pick it up without being asked.
 */

const BUILD =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  process.env.VERCEL_DEPLOYMENT_ID ??
  "dev";

function serviceWorker(build: string): string {
  return `/*
 * SafeSign service worker — generated per build (${build}).
 *
 * The rule that matters: NOTHING under /api is ever cached. A verdict is a
 * safety claim about a live contract, and serving a stale one from disk —
 * after an address has landed on a scam list, say — would be the worst bug
 * this app could have. Only the shell and the icons are cached.
 */

const CACHE = "safesign-${build}";

const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

/** Our own static files. Content-hashed framework bundles match by prefix. */
const IMMUTABLE_PATHS = new Set([
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.png",
]);

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
  // Every cache from an earlier build goes, so a redesign cannot linger.
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))),
      )
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

  // Pages: network first, so a deploy is picked up immediately. The cached
  // shell is a fallback for being offline, never a preference.
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

  // Cache-first ONLY where the URL identifies the content: content-hashed
  // bundles and our own icons.
  const immutable =
    url.pathname.startsWith("/_next/static/") || IMMUTABLE_PATHS.has(url.pathname);

  if (!immutable) return;

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
`;
}

export async function GET() {
  return new Response(serviceWorker(BUILD), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // The worker script itself must never be served stale, or a new build
      // cannot announce itself.
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
