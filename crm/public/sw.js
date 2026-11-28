// etc. CRM service worker: the route runner (/run, the crew surface) opens with no signal after one online visit.
// It keeps two things and nothing else: the last /run page, and the built JS/CSS/fonts under /_next/static.
// Never cached: API responses (the runner keeps its own stops and queued actions on the phone) and back-office pages,
// which carry client data and always need a connection.
// ponytail: the saved page is the route as of the last online load; a background refresh of the day's stops if crews
// start their day without signal.
const V = new URL(location.href).searchParams.get("v") || "0"; // the build: a deploy registers a new one (sw-register.tsx)
const PAGES = `etc-pages-${V}`, STATIC = `etc-static-${V}`;
const ASSET = /\/_next\/static\/[^"'\\\s<>)]+/g;
const offline = () => new Response("<h1 style='font-family:sans-serif'>Offline</h1><p style='font-family:sans-serif'>Open your route once with signal and it will be saved for later.</p>", { headers: { "Content-Type": "text/html" } });

/** Keep a /run page and make sure every asset it names is saved too (the first visit loads them before this worker is in charge). */
async function saveRun(key, res) {
  const html = await res.clone().text();
  await (await caches.open(PAGES)).put(key, res);
  const cache = await caches.open(STATIC);
  await Promise.all([...new Set(html.match(ASSET) || [])].map(async (u) => {
    try {
      if (await cache.match(u, { ignoreVary: true })) return;
      const r = await fetch(u);
      if (r.ok) await cache.put(u, r);
    } catch { /* no signal: it is saved the next time the page loads */ }
  }));
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  // Signed out (redirected to the login page) saves nothing.
  e.waitUntil(fetch("/run", { credentials: "same-origin" }).then((res) => (res.ok && !res.redirected ? saveRun("/run", res) : null)).catch(() => {}));
});

// A new build has new asset names: drop everything saved by older builds.
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("etc-") && k !== PAGES && k !== STATIC) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  // Built assets have their hash in the name, so a saved copy is always right: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) e.waitUntil(cache.put(req, res.clone()));
      return res;
    })());
    return;
  }

  if (req.mode !== "navigate") return;
  // Back at the login page (signed out, or the session ended): this phone no longer shows the saved route.
  if (url.pathname === "/login") { e.waitUntil(caches.delete(PAGES)); return; }
  // "/" is where the home-screen icon opens; signed-in crew are sent on to /run.
  if (url.pathname !== "/run" && url.pathname !== "/") return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req); // network first: always fresh with signal
      if (res.ok && !res.redirected && url.pathname === "/run") e.waitUntil(saveRun(url.pathname + url.search, res.clone()));
      return res;
    } catch {
      const cache = await caches.open(PAGES);
      if (url.pathname === "/") return (await cache.match("/run")) ? Response.redirect("/run", 302) : offline();
      return (await cache.match(url.pathname + url.search)) ?? (await cache.match("/run")) ?? offline();
    }
  })());
});
