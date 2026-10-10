// Guarda a "casca" do app para abrir na hora e funcionar sem internet.
// Cada versão tem a sua gaveta (CACHE) com a página e todos os arquivos juntos.
// Versão nova: o navegador vê que este arquivo mudou, baixa tudo pra uma gaveta nova
// e só então troca. O app aberto recebe o aviso "tem versão nova" (ver fim do app.js).
// Capas dos filmes também ficam guardadas (a lista aparece bonita mesmo offline).
const CACHE = "cinemoteca-v30";
const IMGS = "cinemoteca-capas";
const FONTES = "cinemoteca-fontes";
const MAX_IMGS = 600;
const V = "?v=30";
const SHELL = ["./", "index.html", "styles.css" + V, "app.js" + V, "tmdb.js" + V, "store.js" + V, "now.js" + V, "config.js" + V, "cloud.js" + V, "gostos.js" + V, "amigos.js" + V, "sons.js" + V, "chat.js" + V, "push.js" + V, "vendor/supabase.js" + V, "vendor/qrcode.js" + V,
  "manifest.webmanifest?v=2", "icons/favicon.svg?v=2", "icons/favicon-32.png?v=2", "icons/apple-touch-icon.png?v=2", "icons/icon-192.png?v=2", "icons/icon-512.png?v=2", "icons/icon-maskable-512.png?v=2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMGS && k !== FONTES).map(k => caches.delete(k))))
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
      if (res && res.ok && req.mode !== "navigate") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      clearTimeout(timer);
      if (!done) { done = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      if (!done) fromCache().then(r => { done = true; resolve(r || Response.error()); });
    });
  });
}

// A página (com qualquer ?t=, ?chat=, ?amigo= no endereço) é sempre o index.html guardado.
async function pagina(req) {
  const hit = await (await caches.open(CACHE)).match("index.html");
  return hit || networkFirst(req, 4000);
}

// Arquivo com versão (?v=N) nunca muda: se já tem guardado, abre na hora, sem
// esperar a rede. Versão nova = endereço novo = baixa de novo. Por isso TODO
// arquivo mudado precisa de versão nova (./versao.sh N).
async function cacheFirst(req, nome) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(nome).then(c => c.put(req, copy)); }
  return res;
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
  // Fontes do Google: guarda pra o logo não mudar de letra sem internet.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") { e.respondWith(cacheFirst(e.request, FONTES)); return; }
  if (url.origin !== location.origin) return;
  if (url.searchParams.has("v")) { e.respondWith(cacheFirst(e.request, CACHE)); return; }
  // A página abre direto da gaveta desta versão, sem esperar a rede.
  if (e.request.mode === "navigate") { e.respondWith(pagina(e.request)); return; }
  e.respondWith(networkFirst(e.request, 2000));
});

// ---------- avisos (notificação) ----------
// Chega do servidor (função "push"): { title, body, url, tag, img, badge }.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "Cinemoteca", body: e.data ? e.data.text() : "" }; }
  const tarefas = [self.registration.showNotification(d.title || "Cinemoteca 🍿", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag,
    icon: "icons/icon-192.png?v=2", badge: "icons/icon-192.png?v=2",
    image: d.img || undefined, data: { url: d.url || "./" },
  })];
  if (typeof d.badge === "number" && self.navigator.setAppBadge) tarefas.push(d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge());
  e.waitUntil(Promise.all(tarefas).catch(() => {}));
});
// Tocou no aviso: abre o app já no lugar certo (conversa ou filme).
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope);
  if (alvo.origin !== location.origin) return;
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abertas) {
      if (new URL(c.url).origin === location.origin) {
        await c.focus().catch(() => {});
        c.postMessage({ abrir: alvo.search });
        return;
      }
    }
    await self.clients.openWindow(alvo.href);
  })());
});
