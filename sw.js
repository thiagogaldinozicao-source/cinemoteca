// Guarda a "casca" do app para abrir rápido e funcionar sem internet.
// Capas dos filmes também ficam guardadas (a lista aparece bonita mesmo offline).
const CACHE = "cinemoteca-v13";
const IMGS = "cinemoteca-capas";
const MAX_IMGS = 600;
const V = "?v=13";
const SHELL = ["./", "index.html", "styles.css" + V, "app.js" + V, "tmdb.js" + V, "store.js" + V, "now.js" + V, "config.js" + V, "cloud.js" + V, "gostos.js" + V, "vendor/supabase.js" + V,
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMGS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Internet ruim: se a rede não responder em alguns segundos, abre o que está guardado.
function networkFirst(req, ms) {
  return new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match(req).then(r => r || caches.match("index.html"));
    const timer = setTimeout(() => {
      caches.match(req).then(r => { if (r && !done) { done = true; resolve(r); } });
    }, ms);
    fetch(req, { cache: "no-cache" }).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      clearTimeout(timer);
      if (!done) { done = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      if (!done) fromCache().then(r => { done = true; resolve(r || Response.error()); });
    });
  });
}

// Capas: usa a guardada; se não tiver, baixa e guarda.
async function poster(req) {
  const cache = await caches.open(IMGS);
  const hit = await cache.match(req);
  if (hit) return hit;
  // Pede com CORS (resposta "normal", ocupa o tamanho real no cache).
  // Se o servidor não deixar, mostra a capa sem guardar.
  try {
    const res = await fetch(req.url, { mode: "cors", credentials: "omit" });
    if (res.ok) {
      cache.put(req, res.clone()).then(() => trim(cache)).catch(() => {});
      return res;
    }
  } catch (e) { /* cai pro jeito normal */ }
  return fetch(req);
}
let trimming = false;
async function trim(cache) {
  if (trimming) return; trimming = true;
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_IMGS; i++) await cache.delete(keys[i]);
  } finally { trimming = false; }
}

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.hostname === "image.tmdb.org") { e.respondWith(poster(e.request)); return; }
  if (url.origin !== location.origin) return;
  e.respondWith(networkFirst(e.request, 3500));
});
