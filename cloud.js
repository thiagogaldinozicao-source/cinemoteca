// Conta e nuvem (Supabase): login por código no e-mail e sincronização da lista.
// A lista continua no aparelho (funciona sem internet) e vai/vem da nuvem
// sempre que tem conexão.
import * as store from "./store.js?v=26";

const cfg = window.CINEMOTECA_CONFIG || {};
const URL_ = (cfg.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = (cfg.SUPABASE_KEY || "").trim();
const LAST = "cinemoteca_conta"; // { id, email } da última conta usada aqui

// Ligado pela configuração (e não pela biblioteca ter carregado): se a biblioteca
// falhar, o app continua mostrando a lista da conta em vez de cair no modo antigo.
export const enabled = !!(URL_ && KEY);

let sb = null;
let user = readLast();          // conta conhecida (vale mesmo sem internet)
let online = navigator.onLine;
let status = "idle";            // idle | syncing | ok | offline | error
const listeners = new Set();

function readLast() {
  try { const u = JSON.parse(localStorage.getItem(LAST) || "null"); return u && u.id ? u : null; }
  catch (e) { return null; }
}
function writeLast(u) {
  try { u ? localStorage.setItem(LAST, JSON.stringify(u)) : localStorage.removeItem(LAST); } catch (e) { /* ignora */ }
}
function emit() { listeners.forEach(fn => fn()); }
function setStatus(s) { if (s !== status) { status = s; emit(); } }

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function currentUser() { return user; }
export function syncStatus() { return { status, pending: store.pendingCount(), online }; }

// ---------- início ----------
export function start() {
  if (!enabled) return;
  if (user) store.useAccount(user.id);
  // Com a nuvem ligada a chave do TMDB colada no aparelho não é mais usada.
  try { localStorage.removeItem("cinemoteca_tmdb_key"); } catch (e) { /* ignora */ }
  if (!window.supabase) return; // biblioteca não carregou: segue só com a cópia do aparelho
  sb = window.supabase.createClient(URL_, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit",
      storageKey: "cinemoteca_sessao" },
  });
  sb.auth.onAuthStateChange((event, session) => {
    // Não chamar o Supabase direto aqui dentro (recomendação deles): agenda.
    setTimeout(() => handleAuth(event, session), 0);
  });
  store.onDirty(() => schedule(800));
  window.addEventListener("online", () => { online = true; schedule(0); });
  window.addEventListener("offline", () => { online = false; setStatus("offline"); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(0); });
  setInterval(() => { if (document.visibilityState === "visible") schedule(0); }, 120000);
}

async function handleAuth(event, session) {
  if (session && session.user) {
    const u = { id: session.user.id, email: session.user.email || "" };
    const first = !user || user.id !== u.id;
    user = u; writeLast(u);
    if (first) {
      store.useAccount(u.id);
      emit();
      await firstSync();
    } else {
      emit();
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") schedule(0);
    }
    return;
  }
  // Sem sessão: só sai de verdade se o Supabase disse que saiu (e não por falta de internet).
  if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && navigator.onLine && !hasSavedSession())) {
    if (!user) { emit(); return; }
    const old = user;
    user = null; writeLast(null);
    // Se ainda tinha coisa pra subir, guarda a cópia até entrar de novo.
    if (store.pendingCount()) store.useAccount(null); else store.forgetAccount(old.id);
    emit();
  }
}

function hasSavedSession() {
  try { return !!localStorage.getItem("cinemoteca_sessao"); } catch (e) { return false; }
}

// Primeira vez desta conta neste aparelho: baixa tudo e junta com a lista antiga.
async function firstSync() {
  await sync();
  const old = store.anonItems();
  const n = Object.keys(old).length;
  if (n) {
    // A lista antiga passa pra conta (e fica uma cópia de segurança no aparelho).
    const added = store.mergeIn(old);
    store.retireAnon();
    await sync();
    window.dispatchEvent(new CustomEvent("cinemoteca:migrou", { detail: { total: n, added, pending: store.pendingCount() } }));
  }
}

// ---------- login ----------
function needClient() {
  if (!sb) { const e = new Error("offline"); e.offline = true; throw e; }
}
export async function sendCode(email) {
  needClient();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}
export async function verifyCode(email, code) {
  needClient();
  const { error } = await sb.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) throw error;
}
export async function signOut() {
  if (!sb) return;
  await sync();
  const { error } = await sb.auth.signOut({ scope: "local" });
  if (error && user) { // sem internet: sai só deste aparelho
    const old = user; user = null; writeLast(null);
    if (store.pendingCount()) store.useAccount(null); else store.forgetAccount(old.id);
    emit();
  }
}
export async function accessToken() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data && data.session ? data.session.access_token : null;
}
// Gostos (gêneros escolhidos). null = ainda não escolheu.
export async function loadGostos() {
  if (!sb || !user) throw new Error("offline");
  const { data, error } = await sb.from("gostos").select("data").eq("user_id", user.id).maybeSingle();
  if (error && error.code === "PGRST116") return null; // nenhuma linha
  if (error) throw error;
  return data ? data.data : null;
}
export async function saveGostos(d) {
  if (!sb || !user) return;
  const { error } = await sb.from("gostos").upsert({ user_id: user.id, data: d, updated_at: new Date().toISOString() });
  if (error) throw error;
}
// Chamada de função do banco (amigos e indicações).
export async function rpc(fn, args) {
  if (!sb || !user) { const e = new Error("offline"); e.offline = true; throw e; }
  const { data, error } = await sb.rpc(fn, args || {});
  if (error) throw error;
  return data;
}
// Foto do perfil (bucket público "avatares", um arquivo por pessoa).
export function fotoUrl(f) { return f && URL_ ? `${URL_}/storage/v1/object/public/avatares/${f}` : ""; }
export async function subirFoto(blob) {
  if (!sb || !user) { const e = new Error("offline"); e.offline = true; throw e; }
  const { error } = await sb.storage.from("avatares").upload(`${user.id}.jpg`, blob,
    { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  return rpc("salvar_foto", { v: Date.now() });
}
export async function tirarFoto() {
  if (!sb || !user) { const e = new Error("offline"); e.offline = true; throw e; }
  await rpc("salvar_foto", { v: null });
  await sb.storage.from("avatares").remove([`${user.id}.jpg`]);
}
export function functionsUrl(name) { return `${URL_}/functions/v1/${name}`; }
export function publicKey() { return KEY; }

// ---------- sincronização ----------
// "2026-09-28T14:10:00.123456+00:00" → alguns segundos antes (o Safari não lê microssegundos).
function sinceMinus(since, ms) {
  if (!since) return null;
  const t = new Date(String(since).replace(/(\.\d{3})\d+/, "$1")).getTime();
  return isNaN(t) ? null : new Date(t - ms).toISOString();
}
let timer = null, running = false, again = false;
function schedule(ms) {
  if (!user || !sb) return;
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}

// Como funciona: cada mudança no aparelho marca o título como "pendente" com um
// contador (store.touch). Aqui (1) sobe os pendentes e só limpa os que não
// mudaram de novo durante o envio (store.ack confere o contador); depois
// (2) baixa o que mudou na nuvem desde a última vez (updated_at é a hora do
// servidor; volta 5s pra não perder nada no limite). O que ainda está pendente
// aqui ganha do que veio da nuvem.
export async function sync() {
  if (!user || !sb) return;
  if (!navigator.onLine) { online = false; setStatus("offline"); return; }
  if (running) { again = true; return; }
  running = true; setStatus("syncing");
  try {
    // 1) sobe o que mudou aqui
    const list = store.pending();
    for (let i = 0; i < list.length; i += 400) {
      const part = list.slice(i, i + 400);
      const rows = part.map(p => ({ user_id: user.id, key: p.key, data: p.data, deleted: p.deleted }));
      const { error } = await sb.from("items").upsert(rows, { onConflict: "user_id,key" });
      if (error) throw error;
      store.ack(part);
    }
    // 2) baixa o que mudou nos outros aparelhos
    const since = store.lastPull();
    const from = sinceMinus(since, 5000);
    let page = 0, newest = since, rows = [];
    while (true) {
      let q = sb.from("items").select("key,data,deleted,updated_at")
        .order("updated_at", { ascending: true }).order("key", { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (from) q = q.gte("updated_at", from);
      const { data, error } = await q;
      if (error) throw error;
      rows = rows.concat(data || []);
      if (!data || data.length < 1000) break;
      page++;
    }
    for (const r of rows) if (!newest || r.updated_at > newest) newest = r.updated_at;
    store.applyRemote(rows, newest);
    online = true;
    setStatus(store.pendingCount() ? "syncing" : "ok");
    if (store.pendingCount()) again = true;
  } catch (e) {
    online = navigator.onLine;
    setStatus(online ? "error" : "offline");
    if (e && (e.code === "PGRST301" || e.status === 401)) sb.auth.refreshSession().catch(() => {});
  } finally {
    running = false;
    if (again) { again = false; schedule(1500); }
  }
}
