const CACHE_NAME = "xw-solver-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/crosswordnexus.css",
  "./css/crossword.shared.css",
  "./css/crossword.mobile.css",
  "./js/crosswords.js",
  "./js/crossword.shared.js",
  "./js/crossword.mobile.js",
  "./lib/jquery.js",
  "./lib/jscrossword_combined.js",
  "./lib/lscache.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

/*
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).catch(() => cached);
    })
  );
});

*/
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      // If found in cache, serve it.
      // If NOT found, return the fetch promise directly.
      // Do NOT use .catch() here to return 'cached'.
      return cached || fetch(event.request);
    })
  );
});
