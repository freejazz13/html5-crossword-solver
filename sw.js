// CRITICAL: You MUST change this string (e.g., v3, v4) every time you deploy a new update!
const CACHE_NAME = "xw-solver-v6";

const ASSETS = [
  "/",
  "/nexplay",
  "/nexplay.css",
  "/css/crosswordnexus.css",
  "/css/crossword.shared.css",
  "/css/crossword.mobile.css",
  "/js/crosswords.js",
  "/js/crossword.shared.js",
  "/js/crossword.mobile.js",
  "/lib/jquery.js",
  "/lib/bz2.min.js",
  "/lib/jscrossword_combined.js",
  "/lib/jszip.min.js",
  "/lib/lscache.min.js",
  "/lib/localforage.min.js",
  "/manifest.json",
  "/images/xw-solve-icon-192.png",
  "/images/xw-solve-icon-512.png",
  "/images/nexplay.svg",
  "/images/nexus2.png",
  "/volumes.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of ASSETS) {
      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch (e) {
        console.warn(`Failed to pre-cache: ${url}`);
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()));
    await clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url); // Extract the URL object from the request

  // checks whether a requested file is hosted on own server or on a third-party server (like a CDN).
  // location.origin: The domain where  Service Worker is actually running (website's home address).
  // url.origin: The scheme, domain, and port of the file being requested.
  if (req.method !== "GET" || url.origin !== location.origin) {
    return; // Let the browser handle these normally via network
  }

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(req);
        if (response.ok && !response.redirected) return response;
      } catch {}
      const cached = await caches.match("/");
      return cached || caches.match("/nexplay");
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      return await fetch(req);
    } catch (e) {
      // Return a graceful error instead of an uncaught rejection
      return new Response("Offline and not cached", { status: 503 });
    }
  })());
});
