// Minimal service worker: just enough for "Add to Home Screen" installability,
// plus a network-first cache so previously visited pages still load offline.
//
// Bump CACHE whenever a route or asset is removed. The old version's entries
// are deleted on activate, which is what stops a page that no longer exists
// (the Games view, say) from still being served to an offline installed app
// long after it was deleted from the app itself.
const CACHE = "dashboard-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Same-origin only. Firebase's own endpoints (Firestore streams, token
  // refresh) must never be answered from a cache — a replayed auth or
  // snapshot response is worse than being offline — and caching them stores
  // opaque cross-origin bodies we can't inspect or usefully reuse anyway.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Only cache a real, complete response. A 404 or a 500 cached here
        // would be served back as the "offline copy" of a page that works
        // perfectly well the next time the network is up.
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
