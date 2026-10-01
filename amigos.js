// Amigos e indicações (tudo via funções do Supabase, que conferem a amizade).
// Guarda uma cópia no aparelho pra aba Amigos abrir mesmo sem internet.
import * as cloud from "./cloud.js?v=23";
import { limpa } from "./store.js?v=23";

let perfil = null;   // { nome, codigo }
let amigos = null;   // [{ user_id, nome, desde }]
let caixa = null;    // indicações que chegaram: [{ id, de, nome, key, data, msg, estado, created_at }]
let erro = false;
const listeners = new Set();
const novasListeners = new Set();
const entrouListeners = new Set();

function uid() { const u = cloud.currentUser(); return u ? u.id : null; }
function k(n) { return `cinemoteca_${n}_${uid()}`; }
function ler(n) { try { return JSON.parse(localStorage.getItem(k(n)) || "null"); } catch (e) { return null; } }
function gravar(n, v) { try { localStorage.setItem(k(n), JSON.stringify(v)); } catch (e) { /* ignora */ } }
function emit() { listeners.forEach(fn => fn()); }

export function onChange(fn) { listeners.add(fn); }
// fn(lista) com indicações que chegaram e ainda não foram avisadas neste aparelho.
export function onNovas(fn) { novasListeners.add(fn); }

// fn(lista) com amigos que entraram por convite seu (aparece pra quem convidou).
export function onEntrou(fn) { entrouListeners.add(fn); }
export function getPerfil() { return perfil; }
export function getAmigos() { return amigos; }
export function getCaixa() { return caixa; }
export function falhou() { return erro; }
export function pendentes() { return (caixa || []).filter(i => i.estado !== "aceita"); }
export function novas() { return (caixa || []).filter(i => i.estado === "nova").length; }
export function nomeDe(id) { const a = (amigos || []).find(x => x.user_id === id); return a ? a.nome : "Amigo"; }
export function fotoDe(id) { const a = (amigos || []).find(x => x.user_id === id); return a ? a.foto : null; }
export const fotoUrl = cloud.fotoUrl;
// Nome confirmado pela pessoa (o primeiro vem do e-mail e pode ficar feio).
export function nomeConfirmado() { try { return !!localStorage.getItem(k("nome_ok")); } catch (e) { return true; } }
export function codigoFmt(c) { return c ? c.slice(0, 3) + "-" + c.slice(3) : ""; }
export function linkConvite() { return perfil ? location.origin + location.pathname + "?amigo=" + perfil.codigo : ""; }

export function reset() { perfil = amigos = caixa = null; erro = false; emit(); }

let carregando = null;
export function carregar() {
  if (!uid()) return Promise.resolve();
  if (!perfil) { perfil = ler("perfil"); amigos = ler("amigos"); caixa = (ler("caixa") || []).map(i => ({ ...i, data: limpa(i.data) })); if (perfil) emit(); }
  if (carregando) return carregando;
  carregando = (async () => {
    try {
      const [p, r] = await Promise.all([cloud.rpc("meu_perfil"), cloud.rpc("resumo")]);
      perfil = p && p[0] ? p[0] : null;
      gravar("perfil", perfil);
      aplicar(r);
      erro = false;
    } catch (e) { erro = true; }
    carregando = null;
    emit();
  })();
  return carregando;
}
function aplicar(r) {
  amigos = (r && r.amigos) || [];
  caixa = ((r && r.caixa) || []).map(i => ({ ...i, data: limpa(i.data) }));
  gravar("amigos", amigos); gravar("caixa", caixa);
  avisarNovas();
  avisarEntrou();
}
// Atualiza amigos + caixa numa chamada só (roda de tempos em tempos).
export async function atualizarCaixa() {
  if (!uid() || !navigator.onLine) return;
  try { aplicar(await cloud.rpc("resumo")); emit(); } catch (e) { /* tenta depois */ }
}
// Amigo novo que não fui eu que adicionei = aceitou meu convite.
function avisarEntrou() {
  const conhecidos = ler("conhecidos");
  const ids = (amigos || []).map(a => a.user_id);
  gravar("conhecidos", ids);
  if (!conhecidos) return; // primeira vez neste aparelho: só anota
  const set = new Set(conhecidos);
  const novos = (amigos || []).filter(a => !set.has(a.user_id));
  if (novos.length) entrouListeners.forEach(fn => fn(novos));
}
function conhecer(id) { const c = ler("conhecidos"); if (c && !c.includes(id)) gravar("conhecidos", [...c, id]); }
function avisarNovas() {
  const vistos = new Set(ler("avisados") || []);
  const nov = (caixa || []).filter(i => i.estado === "nova" && !vistos.has(i.id));
  if (!nov.length) return;
  nov.forEach(i => vistos.add(i.id));
  gravar("avisados", [...vistos].slice(-300));
  novasListeners.forEach(fn => fn(nov));
}

let timer = null;
export function start() {
  if (timer) return;
  timer = setInterval(() => { if (document.visibilityState === "visible") atualizarCaixa(); }, 90000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") atualizarCaixa(); });
}

// ---------- ações ----------
export async function salvarNome(nome) {
  await cloud.rpc("salvar_nome", { novo: nome });
  if (perfil) perfil = { ...perfil, nome: nome.trim().slice(0, 30) };
  gravar("perfil", perfil);
  try { localStorage.setItem(k("nome_ok"), "1"); } catch (e) { /* ignora */ }
  emit();
}
export function confirmarNome() { try { localStorage.setItem(k("nome_ok"), "1"); } catch (e) { /* ignora */ } emit(); }

// Foto: corta quadrado no centro, reduz pra 256px e vira JPEG leve (~20 KB).
function comprimir(file) {
  return new Promise((ok, falha) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const lado = Math.min(img.naturalWidth, img.naturalHeight), T = 256;
      const c = document.createElement("canvas"); c.width = c.height = T;
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, T, T);
      c.toBlob(b => b ? ok(b) : falha(new Error("imagem")), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error("imagem")); };
    img.src = url;
  });
}
export async function trocarFoto(file) {
  const f = await cloud.subirFoto(await comprimir(file));
  perfil = { ...perfil, foto: f };
  gravar("perfil", perfil);
  emit();
}
export async function removerFoto() {
  await cloud.tirarFoto();
  perfil = { ...perfil, foto: null };
  gravar("perfil", perfil);
  emit();
}

export async function verConvite(cod) {
  const r = await cloud.rpc("ver_convite", { cod });
  return r && r[0] ? r[0] : null;
}
export async function trocarCodigo() {
  const c = await cloud.rpc("trocar_codigo");
  perfil = { ...perfil, codigo: c };
  gravar("perfil", perfil);
  emit();
  return c;
}
export async function aceitarConvite(cod) {
  const r = await cloud.rpc("aceitar_convite", { cod });
  if (r && r[0]) conhecer(r[0].user_id);
  await carregar();
  return r && r[0] ? r[0] : null;
}
export async function desfazer(id) {
  await cloud.rpc("desfazer_amizade", { amigo: id });
  amigos = (amigos || []).filter(a => a.user_id !== id);
  gravar("amigos", amigos);
  emit();
}
export function listaDo(id) { return cloud.rpc("lista_do_amigo", { amigo: id }); }
export function indiqueiPra(id) { return cloud.rpc("indiquei_pra", { amigo: id }); }

// Só o necessário pra mostrar o card e abrir os detalhes.
function enxuto(m) {
  const o = {};
  for (const f of ["id", "key", "type", "title", "original", "year", "poster", "backdrop", "vote", "votes", "genreIds"]) if (m[f] != null) o[f] = m[f];
  return o;
}
export async function indicar(ids, m, msg) {
  const dados = enxuto(m);
  await Promise.all(ids.map(id => cloud.rpc("indicar", { para_quem: id, chave: m.key, dados, mensagem: msg || "" })));
}

async function marcar(ids, novo) {
  if (!ids.length) return;
  const set = new Set(ids);
  caixa = (caixa || []).map(i => set.has(i.id) ? { ...i, estado: novo } : i).filter(i => i.estado !== "dispensada");
  gravar("caixa", caixa);
  emit();
  try { await cloud.rpc("marcar_indicacoes", { ids, novo }); } catch (e) { /* fica pra próxima */ }
}
// Abriu a aba: as novas passam a "vistas" (some o numerozinho).
export function lerCaixa() { return marcar((caixa || []).filter(i => i.estado === "nova").map(i => i.id), "vista"); }
export function aceitar(i) { return marcar([i.id], "aceita"); }
export function dispensar(i) { return marcar([i.id], "dispensada"); }
// Quem me indicou este título (pra mostrar nos detalhes).
export function quemIndicou(key) { return (caixa || []).filter(i => i.key === key); }
