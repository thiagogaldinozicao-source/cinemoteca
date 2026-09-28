// Lista salva no próprio aparelho (localStorage). Nada sai do celular.
const KEY = "cinemoteca_lista_v1";

let state = { items: {} };
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s.items === "object") state = { items: s.items };
    }
  } catch (e) { /* começa vazio */ }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch (e) { return false; }
}
function emit() { listeners.forEach(fn => fn()); }

load();

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function get(key) { return state.items[key] || null; }
export function all() { return Object.values(state.items); }

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
  const ok = persist(); emit(); return ok;
}
export function setStatus(key, status) {
  const it = state.items[key]; if (!it) return false;
  it.status = status;
  it.seenAt = status === "seen" ? Date.now() : null;
  const ok = persist(); emit(); return ok;
}
export function setNote(key, note) {
  const it = state.items[key]; if (!it) return false;
  it.note = note;
  const ok = persist(); emit(); return ok;
}
export function setMemo(key, memo) {
  const it = state.items[key]; if (!it) return false;
  if ((it.memo || "") === memo) return true;
  it.memo = memo.slice(0, 300);
  const ok = persist(); emit(); return ok;
}
export function remove(key) {
  delete state.items[key];
  const ok = persist(); emit(); return ok;
}
// Reordena a fila "Quero ver" (usado pelas setas de subir/descer).
export function move(key, dir) {
  const want = all().filter(i => i.status === "want").sort(byOrder);
  const idx = want.findIndex(i => i.key === key);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= want.length) return;
  want.forEach((it, k) => { it.order = k; });
  want[idx].order = j; want[j].order = idx;
  persist(); emit();
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
    n++;
  }
  persist(); emit();
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
  return true;
}
// Duração e gêneros (pro "O que ver agora?"). save=false junta várias antes de salvar.
export function setMeta(key, meta, save = true) {
  const it = state.items[key]; if (!it) return false;
  if (meta.runtime) it.runtime = meta.runtime;
  if (meta.epRuntime) it.epRuntime = meta.epRuntime;
  if (meta.genreIds && meta.genreIds.length) it.genreIds = meta.genreIds.slice(0, 6);
  it.metaAt = Date.now();
  return save ? persist() : true;
}
export function flush() { const ok = persist(); emit(); return ok; }

export function clearAll() { state = { items: {} }; persist(); emit(); }
