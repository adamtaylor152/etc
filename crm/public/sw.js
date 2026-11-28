// etc. CRM service worker: keeps the route and visit pages you've opened readable when cell signal drops
// mid-storm. Network first (always fresh when online); falls back to the last copy. Only GET pages are
// cached; actions (marking done, uploads) still need a connection.
// ponytail: no offline write queue; add one (IndexedDB + replay) if crews regularly work without signal.
const CACHE = "etc-pages-v2";
const OFFLINE_PATHS = [/^\/$/, /^\/run/, /^\/routes/, /^\/visits\//, /^\/snow/, /^\/schedule/];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || req.mode !== "navigate") return;
  if (!OFFLINE_PATHS.some((re) => re.test(url.pathname))) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch {
      const hit = await caches.match(req);
      return hit ?? new Response("<h1 style='font-family:sans-serif'>Offline</h1><p style='font-family:sans-serif'>Open this page once with signal and it will be saved for later.</p>", { headers: { "Content-Type": "text/html" } });
    }
  })());
});
