// CRITICAL: You MUST change this string (e.g., v3, v4) every time you deploy a new update!
const CACHE_NAME = "xw-solver-v2";

// Absolute paths ensure index.html and nexplay.html see the same files
const ASSETS = [
    "/",
    "/index.html",
    "/nexplay.html",
    "/nexplay.css",
    "/css/crosswordnexus.css",
    "/css/crossword.shared.css",
    "/css/crossword.mobile.css",
    "/js/crosswords.js",
    "/js/crossword.shared.js",
    "/js/crossword.mobile.js",
    "/lib/jquery.js",
    "/lib/jscrossword_combined.js",
    "/lib/lscache.min.js",
    "/manifest.json",
    "/images/xw-solve-icon-192.png",
    "/images/xw-solve-icon-512.png",
    "/images/nexplay.svg",
    "/images/nexus2.png"
];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // Use return to ensure the promise resolves correctly
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request).then(cached => {
            // Return cached, or fetch from network
            return cached || fetch(event.request);
        })
    );
});
