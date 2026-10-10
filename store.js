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
    // passa pelo limpa: lista guardada por versões antigas pode ter dado fora do formato
    const items = {};
    for (const [k, v] of Object.entries(s.items || {})) if (v && v.id && v.type) items[k] = { ...limpa(v), key: k };
    return { items, dirty: s.dirty || {}, lastPull: s.lastPull || null };
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
    else if (r.data && r.data.id && r.data.type) {
      // só conta como mudança se veio diferente do que já tem (senão a tela redesenha à toa)
      const novo = { ...limpa(r.data), key: r.key };
      if (!igual(state.items[r.key], novo)) { state.items[r.key] = novo; n++; }
    }
  }
  if (pulledUntil) state.lastPull = pulledUntil;
  persist();
  if (n) emit();
  return n;
}
// Compara dois títulos sem ligar pra ordem dos campos.
function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
function igual(a, b) { return !!a && !!b && canon(a) === canon(b); }
// Junta a lista antiga do aparelho com a da conta, sem perder nada.
export function mergeIn(items) {
  let added = 0;
  for (const [k, v] of Object.entries(items || {})) {
    if (!v || !v.id || !v.type || !v.title) continue;
    const cur = state.items[k];
    if (!cur) { state.items[k] = { ...limpa(v), key: k }; touch(k); added++; continue; }
    let upd = false;
    if (!cur.memo && v.memo) { cur.memo = v.memo; upd = true; }
    if (!cur.note && v.note) { cur.note = v.note; upd = true; }
    if (!cur.prog && v.prog) { cur.prog = limpaProg(v.prog); upd = !!cur.prog || upd; }
    if (cur.status === "want" && v.status === "seen") { cur.status = "seen"; cur.seenAt = v.seenAt || Date.now(); upd = true; }
    if (upd) touch(k);
  }
  changed();
  return added;
}

// ---------- lista ----------
// Dado que vem de fora (lista de amigo, indicação, backup, nuvem): só passa no
// formato certo. Capa fora do padrão do TMDB ("/abc.jpg") vira vazio — senão um
// texto malicioso na capa viraria código rodando no app. Nota/votos viram número.
export function limpa(m) {
  if (!m || typeof m !== "object") return m;
  const num = v => (v === "" || v == null || !isFinite(+v) ? null : +v);
  const img = p => (typeof p === "string" && /^\/[\w.-]+$/.test(p) ? p : "");
  return {
    ...m, title: String(m.title || "Sem título"), year: String(m.year || "").slice(0, 4),
    original: m.original ? String(m.original) : "", poster: img(m.poster), backdrop: img(m.backdrop),
    status: m.status === "seen" ? "seen" : "want",
    vote: num(m.vote), votes: num(m.votes) || 0, note: num(m.note) || 0,
    memo: m.memo ? String(m.memo).slice(0, 300) : "",
    genreIds: Array.isArray(m.genreIds) ? m.genreIds.map(Number).filter(isFinite) : [],
    prog: limpaProg(m.prog),
    temps: Array.isArray(m.temps) ? m.temps.slice(0, 80).map(n => Math.max(0, Math.min(999, Math.round(+n) || 0))) : undefined,
  };
}
// Onde parou na série: { s: temporada, e: último episódio visto, at: quando }.
function limpaProg(p) {
  if (!p || typeof p !== "object") return null;
  const s = Math.round(+p.s), e = Math.round(+p.e);
  if (!isFinite(s) || !isFinite(e) || s < 1 || s > 99 || e < 0 || e > 999) return null;
  return { s, e, at: isFinite(+p.at) ? +p.at : 0 };
}
// Guarda só o essencial para mostrar a lista sem internet.
function slim(m0) {
  const m = limpa(m0);
  return {
    key: m.key, id: m.id, type: m.type, title: m.title, original: m.original || "",
    year: m.year || "", poster: m.poster || "", vote: m.vote ?? null, votes: m.votes || 0,
    ...(m.genreIds && m.genreIds.length ? { genreIds: m.genreIds.slice(0, 6) } : {}),
    ...(m.runtime ? { runtime: m.runtime } : {}),
    ...(m.epRuntime ? { epRuntime: m.epRuntime } : {}),
    ...(m.temps && m.temps.length ? { temps: m.temps } : {}),
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
// Série: em que temporada/episódio parou. null apaga.
export function setProg(key, prog) {
  const it = state.items[key]; if (!it) return false;
  const p = prog ? limpaProg({ ...prog, at: Date.now() }) : null;
  if (p && p.s === 1 && p.e === 0) it.prog = null; else it.prog = p;
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
// Desfazer: devolve o título exatamente como estava.
export function restore(item) {
  if (!item || !item.key) return false;
  state.items[item.key] = { ...item };
  touch(item.key);
  return changed();
}
export function remove(key) {
  delete state.items[key];
  touch(key);
  return changed();
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
export function exportJSON() {
  return JSON.stringify({ app: "cinemoteca", version: 1, exportedAt: new Date().toISOString(), items: state.items }, null, 2);
}
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || typeof data.items !== "object") throw new Error("Arquivo inválido");
  // Junta com a lista atual sem apagar nada (nota, status e anotação atuais ficam).
  return mergeIn(data.items);
}
// Importa um título já achado no TMDB, sem sobrescrever o que já existe.
// Salva no aparelho uma vez só no fim (flush), pra ser rápido com listas grandes.
export function addImported(media, { status = "want", memo = "", note = 0 } = {}) {
  if (state.items[media.key]) return false;
  const now = Date.now();
  state.items[media.key] = {
    ...slim(media), status, addedAt: now, seenAt: status === "seen" ? now : null,
    note: note || 0, memo: String(memo || "").slice(0, 300),
  };
  touch(media.key);
  return true;
}
// Duração e gêneros (pro "O que ver agora?"). save=false junta várias antes de salvar.
export function setMeta(key, meta, save = true) {
  const it = state.items[key]; if (!it) return false;
  const same = it.metaAt && (!meta.runtime || meta.runtime === it.runtime) && (!meta.epRuntime || meta.epRuntime === it.epRuntime)
    && (!meta.genreIds || !meta.genreIds.length || meta.genreIds.slice(0, 6).join() === (it.genreIds || []).join())
    && (!meta.temps || !meta.temps.length || meta.temps.join() === (it.temps || []).join());
  if (same) return true;
  if (meta.runtime) it.runtime = meta.runtime;
  if (meta.epRuntime) it.epRuntime = meta.epRuntime;
  if (meta.genreIds && meta.genreIds.length) it.genreIds = meta.genreIds.slice(0, 6);
  if (meta.temps && meta.temps.length) it.temps = limpa({ temps: meta.temps }).temps;
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
