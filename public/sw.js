// Hub service worker: installable PWA + offline shell.
// - Hashed build assets (/_next/static) are immutable: cache-first.
// - Pages: network-first with a 2.5s timeout, then the cached copy — so a
//   weak 4G connection never leaves the app on a blank screen.
// - /api and anything cross-origin (Firebase, Stripe) is never cached.
// Bump CACHE when routes are removed so old pages stop being served.
const CACHE = "hub-v2-1";
const SHELL = ["/today", "/inbox", "/tasks", "/academy"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

const put = (req, res) => {
  if (res.ok && res.type === "basic") caches.open(CACHE).then((c) => c.put(req, res.clone()));
  return res;
};

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }

  event.respondWith(
    new Promise((resolve) => {
      let done = false;
      const fallback = () =>
        caches.match(req).then((hit) => {
          if (!done && hit) (done = true), resolve(hit);
        });
      const timer = setTimeout(fallback, 2500);
      fetch(req)
        .then((res) => {
          clearTimeout(timer);
          put(req, res);
          if (!done) (done = true), resolve(res);
        })
        .catch(() => {
          clearTimeout(timer);
          caches.match(req).then((hit) => !done && ((done = true), resolve(hit || caches.match("/today"))));
        });
    })
  );
});
