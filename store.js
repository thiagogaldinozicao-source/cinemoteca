// Lista guardada no aparelho (localStorage).
// Sem login: fica numa gaveta só do aparelho (modo antigo).
// Com login: cada conta tem a sua gaveta aqui, que é uma cópia da nuvem
// (é o que deixa ver a lista sem internet). O que muda fica marcado como
// "pendente" até o cloud.js mandar pro Supabase.
const ANON = "cinemoteca_lista_v1";
const BACKUP = "cinemoteca_lista_v1_antes_da_nuvem";
const userKey = uid => "cinemoteca_u_" + uid;

let storageKey = ANON;
let state = fresh();
const listeners = new Set();
let dirtyHook = null;

function fresh() { return { items: {}, dirty: {}, lastPull: null }; }

function read(k) {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return fresh();
    const s = JSON.parse(raw);
    if (!s || typeof s.items !== "object") return fresh();
    return { items: s.items || {}, dirty: s.dirty || {}, lastPull: s.lastPull || null };
  } catch (e) { return fresh(); }
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); return true; }
  catch (e) { return false; }
}
function emit() { listeners.forEach(fn => fn()); }
// Marca o título como alterado (vai pra nuvem na próxima sincronização).
function touch(key) {
  state.dirty[key] = (state.dirty[key] || 0) + 1;
}
function changed() {
  const ok = persist(); emit();
  if (dirtyHook) dirtyHook();
  return ok;
}

state = read(ANON);

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onDirty(fn) { dirtyHook = fn; }
export function get(key) { return state.items[key] || null; }
export function all() { return Object.values(state.items); }

// ---------- gaveta (sem login x conta) ----------
export function useAccount(uid) {
  const k = uid ? userKey(uid) : ANON;
  if (k === storageKey) return;
  storageKey = k;
  state = read(k);
  emit();
}
export function forgetAccount(uid) {
  try { localStorage.removeItem(userKey(uid)); } catch (e) { /* ignora */ }
  if (storageKey === userKey(uid)) { storageKey = ANON; state = read(ANON); emit(); }
}
// Lista feita antes do login (fica só neste aparelho).
export function anonItems() { return read(ANON).items; }
// Depois de subir pra nuvem, guarda uma cópia de segurança e limpa a gaveta antiga.
export function retireAnon() {
  try {
    const raw = localStorage.getItem(ANON);
    if (raw) { localStorage.setItem(BACKUP, raw); localStorage.removeItem(ANON); }
  } catch (e) { /* ignora */ }
}

// ---------- sincronização ----------
export function pending() {
  return Object.entries(state.dirty).map(([key, rev]) => {
    const it = state.items[key];
    return { key, rev, deleted: !it, data: it || {} };
  });
}
export function pendingCount() { return Object.keys(state.dirty).length; }
export function ack(list) {
  let n = 0;
  for (const p of list) if (state.dirty[p.key] === p.rev) { delete state.dirty[p.key]; n++; }
  if (n) persist();
}
export function lastPull() { return state.lastPull; }
// Aplica o que veio da nuvem. O que ainda não subiu daqui tem prioridade.
export function applyRemote(rows, pulledUntil) {
  let n = 0;
  for (const r of rows) {
    if (!r || !r.key || state.dirty[r.key]) continue;
    if (r.deleted) { if (state.items[r.key]) { delete state.items[r.key]; n++; } }
    else if (r.data && r.data.id && r.data.type) { state.items[r.key] = { ...r.data, key: r.key }; n++; }
  }
  if (pulledUntil) state.lastPull = pulledUntil;
  persist();
  if (n) emit();
  return n;
}
// Junta a lista antiga do aparelho com a da conta, sem perder nada.
export function mergeIn(items) {
  let added = 0;
  for (const [k, v] of Object.entries(items || {})) {
    if (!v || !v.id || !v.type || !v.title) continue;
    const cur = state.items[k];
    if (!cur) { state.items[k] = { ...v, key: k }; touch(k); added++; continue; }
    let upd = false;
    if (!cur.memo && v.memo) { cur.memo = v.memo; upd = true; }
    if (!cur.note && v.note) { cur.note = v.note; upd = true; }
    if (cur.status === "want" && v.status === "seen") { cur.status = "seen"; cur.seenAt = v.seenAt || Date.now(); upd = true; }
    if (upd) touch(k);
  }
  changed();
  return added;
}

// ---------- lista ----------
// Guarda só o essencial para mostrar a lista sem internet.
function slim(m) {
  return {
    key: m.key, id: m.id, type: m.type, title: m.title, original: m.original || "",
    year: m.year || "", poster: m.poster || "", vote: m.vote ?? null, votes: m.votes || 0,
    ...(m.genreIds && m.genreIds.length ? { genreIds: m.genreIds.slice(0, 6) } : {}),
    ...(m.runtime ? { runtime: m.runtime } : {}),
    ...(m.epRuntime ? { epRuntime: m.epRuntime } : {}),
  };
}

export function add(media, status = "want") {
  const cur = state.items[media.key];
  const now = Date.now();
  state.items[media.key] = {
    ...(cur || {}),
    ...slim(media),
    status,
    addedAt: cur ? cur.addedAt : now,
    seenAt: status === "seen" ? (cur && cur.seenAt) || now : null,
    note: cur ? cur.note || 0 : 0,
    memo: cur ? cur.memo || "" : "",
  };
  touch(media.key);
  return changed();
}
export function setStatus(key, status) {
  const it = state.items[key]; if (!it) return false;
  it.status = status;
  it.seenAt = status === "seen" ? Date.now() : null;
  touch(key);
  return changed();
}
export function setNote(key, note) {
  const it = state.items[key]; if (!it) return false;
  it.note = note;
  touch(key);
  return changed();
}
export function setMemo(key, memo) {
  const it = state.items[key]; if (!it) return false;
  if ((it.memo || "") === memo) return true;
  it.memo = memo.slice(0, 300);
  touch(key);
  return changed();
}
export function remove(key) {
  delete state.items[key];
  touch(key);
  return changed();
}
// Reordena a fila "Quero ver" (usado pelas setas de subir/descer).
export function move(key, dir) {
  const want = all().filter(i => i.status === "want").sort(byOrder);
  const idx = want.findIndex(i => i.key === key);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= want.length) return;
  want.forEach((it, k) => { if (it.order !== k) { it.order = k; touch(it.key); } });
  want[idx].order = j; want[j].order = idx;
  touch(want[idx].key); touch(want[j].key);
  changed();
}
// Nota "justa": puxa pra 6.5 quem tem pouco voto, pra lançamento com meia dúzia
// de fãs não passar na frente de clássico com milhares de avaliações.
export function quality(m) {
  const v = typeof m.vote === "number" ? m.vote : 0, n = m.votes || 0;
  return (v * n + 6.5 * 200) / (n + 200);
}
// Melhores primeiro; empate fica por quem entrou antes.
export function byQuality(a, b) {
  return quality(b) - quality(a) || (a.addedAt || 0) - (b.addedAt || 0);
}
export function byOrder(a, b) {
  const oa = a.order ?? -a.addedAt, ob = b.order ?? -b.addedAt;
  return oa - ob;
}

export function exportJSON() {
  return JSON.stringify({ app: "cinemoteca", version: 1, exportedAt: new Date().toISOString(), items: state.items }, null, 2);
}
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || typeof data.items !== "object") throw new Error("Arquivo inválido");
  let n = 0;
  for (const [k, v] of Object.entries(data.items)) {
    if (!v || !v.id || !v.type || !v.title) continue;
    state.items[k] = { ...v, key: k };
    touch(k);
    n++;
  }
  changed();
  return n;
}
// Importa um título já achado no TMDB, sem sobrescrever o que já existe.
// Salva no aparelho uma vez só no fim (flush), pra ser rápido com listas grandes.
export function addImported(media, { status = "want", memo = "", order = null, note = 0 } = {}) {
  if (state.items[media.key]) return false;
  const now = Date.now();
  state.items[media.key] = {
    ...slim(media), status, addedAt: now, seenAt: status === "seen" ? now : null,
    note: note || 0, memo: String(memo || "").slice(0, 300),
    ...(order != null ? { order } : {}),
  };
  touch(media.key);
  return true;
}
// Duração e gêneros (pro "O que ver agora?"). save=false junta várias antes de salvar.
export function setMeta(key, meta, save = true) {
  const it = state.items[key]; if (!it) return false;
  const same = it.metaAt && (!meta.runtime || meta.runtime === it.runtime) && (!meta.epRuntime || meta.epRuntime === it.epRuntime)
    && (!meta.genreIds || !meta.genreIds.length || meta.genreIds.slice(0, 6).join() === (it.genreIds || []).join());
  if (same) return true;
  if (meta.runtime) it.runtime = meta.runtime;
  if (meta.epRuntime) it.epRuntime = meta.epRuntime;
  if (meta.genreIds && meta.genreIds.length) it.genreIds = meta.genreIds.slice(0, 6);
  it.metaAt = Date.now();
  touch(key);
  if (!save) return true;
  const ok = persist();
  if (dirtyHook) dirtyHook();
  return ok;
}
export function flush() { return changed(); }

export function clearAll() {
  for (const k of Object.keys(state.items)) touch(k);
  state.items = {};
  return changed();
}
