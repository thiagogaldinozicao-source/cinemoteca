// Conversa entre amigos. Mensagem nova chega na hora (tempo real do Supabase)
// enquanto o app tá aberto; com o app fechado quem avisa é a notificação (push.js).
// Guarda as últimas mensagens de cada conversa no aparelho pra abrir sem internet.
import * as cloud from "./cloud.js?v=27";
import { limpa } from "./store.js?v=27";

let conversas = new Map(); // amigo -> { texto, item, de, created_at, naolidas }
const msgs = new Map();    // amigo -> [mensagens]
const listeners = new Set();
const chegouListeners = new Set();
let canal = null;
let aberta = null;         // amigo da conversa aberta na tela

const me = () => { const u = cloud.currentUser(); return u ? u.id : null; };
const k = n => `cinemoteca_${n}_${me()}`;
function ler(n) { try { return JSON.parse(localStorage.getItem(k(n)) || "null"); } catch (e) { return null; } }
function gravar(n, v) { try { localStorage.setItem(k(n), JSON.stringify(v)); } catch (e) { /* ignora */ } }
function emit() { listeners.forEach(fn => fn()); }

// Mensagem que vem de fora passa pelo formato certo (item = card de filme).
function limpaMsg(m) {
  if (!m || !m.id) return null;
  return {
    id: +m.id, de: String(m.de), para: String(m.para), texto: String(m.texto || "").slice(0, 1000),
    item: m.item && typeof m.item === "object" && /^(movie|tv):\d+$/.test(m.item.key || "") ? limpa(m.item) : null,
    lida: !!m.lida, created_at: m.created_at,
  };
}

export function onChange(fn) { listeners.add(fn); }
// fn(msg) quando chega mensagem de amigo (pra tocar a vinheta e avisar).
export function onChegou(fn) { chegouListeners.add(fn); }
export function getConversa(amigo) { return msgs.get(amigo) || ler("msgs_" + amigo) || []; }
export function resumoDe(amigo) { return conversas.get(amigo) || null; }
export function naoLidas(amigo) {
  if (amigo) return (conversas.get(amigo) || {}).naolidas || 0;
  let n = 0; conversas.forEach(c => n += c.naolidas || 0); return n;
}
export function reset() { conversas = new Map(); msgs.clear(); aberta = null; parar(); emit(); }

// Vem junto do "resumo" (amigos.js chama).
export function aplicar(lista) {
  conversas = new Map((lista || []).map(c => [c.amigo, { texto: String(c.texto || ""), item: c.item ? limpa(c.item) : null, de: c.de, created_at: c.created_at, naolidas: +c.naolidas || 0 }]));
  if (aberta && conversas.has(aberta)) conversas.get(aberta).naolidas = 0;
  gravar("conversas", [...conversas].map(([amigo, c]) => ({ amigo, ...c })));
  emit();
}
export function carregarCache() {
  if (conversas.size) return;
  const c = ler("conversas");
  if (c) aplicar(c);
}

function junta(amigo, novas) {
  const m = new Map(getConversa(amigo).map(x => [x.id, x]));
  for (const x of novas) if (x) m.set(x.id, x);
  const lista = [...m.values()].sort((a, b) => a.id - b.id);
  msgs.set(amigo, lista);
  gravar("msgs_" + amigo, lista.slice(-60));
  const u = lista[lista.length - 1];
  if (u) {
    const c = conversas.get(amigo) || { naolidas: 0 };
    conversas.set(amigo, { ...c, texto: u.texto, item: u.item, de: u.de, created_at: u.created_at });
  }
  return lista;
}

export async function abrir(amigo) {
  aberta = amigo;
  const c = conversas.get(amigo); if (c) c.naolidas = 0;
  emit();
  try {
    junta(amigo, ((await cloud.rpc("conversa", { amigo })) || []).map(limpaMsg));
    emit();
    cloud.rpc("ler_conversa", { amigo }).catch(() => {});
  } catch (e) { /* sem internet: fica o que tem guardado */ }
}
export function fechar() { aberta = null; }
export function abertaCom() { return aberta; }

export async function maisAntigas(amigo) {
  const l = getConversa(amigo);
  if (!l.length) return 0;
  const r = ((await cloud.rpc("conversa", { amigo, antes: l[0].id })) || []).map(limpaMsg);
  junta(amigo, r); emit();
  return r.length;
}

// Card de filme: só o necessário pra mostrar e abrir os detalhes.
function enxuto(m) {
  const o = {};
  for (const f of ["id", "key", "type", "title", "year", "poster", "vote", "votes"]) if (m[f] != null) o[f] = m[f];
  return o;
}
export async function mandar(amigo, texto, item) {
  const r = limpaMsg(await cloud.rpc("mandar_msg", { amigo, txt: texto || "", dados: item ? enxuto(item) : null }));
  junta(amigo, [r]); emit();
  return r;
}

// ---------- tempo real ----------
export function iniciar() {
  const sb = cloud.client();
  if (!sb || canal || !me()) return;
  canal = sb.channel("msgs-" + me())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens", filter: `para=eq.${me()}` }, p => {
      const m = limpaMsg(p.new); if (!m) return;
      junta(m.de, [m]);
      const c = conversas.get(m.de);
      if (aberta === m.de) { cloud.rpc("ler_conversa", { amigo: m.de }).catch(() => {}); }
      else if (c) c.naolidas = (c.naolidas || 0) + 1;
      emit();
      chegouListeners.forEach(fn => fn(m, aberta === m.de));
    })
    .subscribe();
}
export function parar() {
  const sb = cloud.client();
  if (canal && sb) { try { sb.removeChannel(canal); } catch (e) { /* ignora */ } }
  canal = null;
}
// Voltou pro app: o canal pode ter caído com o celular bloqueado.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !me()) return;
  parar(); iniciar();
  if (aberta) abrir(aberta);
});
