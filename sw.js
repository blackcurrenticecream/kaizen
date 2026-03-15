// Bloom SW — minimal, safe, no caching that breaks Firebase
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.map(c => caches.delete(c)))));
  self.clients.claim();
});
// intentionally empty fetch handler — let everything through normally
