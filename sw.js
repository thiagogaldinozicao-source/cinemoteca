// Guarda a "casca" do app para abrir rápido e funcionar sem internet.
// A busca e as capas continuam vindo da internet.
const CACHE = "cinemoteca-v8";
const V = "?v=8";
const SHELL = ["./", "index.html", "styles.css" + V, "app.js" + V, "tmdb.js" + V, "store.js" + V, "now.js" + V, "config.js" + V,
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Rede primeiro (pega atualizações), cache se estiver sem internet.
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
