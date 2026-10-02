// Avisos no celular (notificação), mesmo com o app fechado.
// No iPhone só funciona com o app salvo na tela de início (iOS 16.4+) e
// o pedido de permissão TEM que sair de um toque da pessoa.
import * as cloud from "./cloud.js?v=27";

const PUB = (window.CINEMOTECA_CONFIG || {}).VAPID_PUBLIC || "";
const PREF = "cinemoteca_avisos";

export function quais() {
  try { return { chat: true, ind: true, sug: true, ...JSON.parse(localStorage.getItem(PREF) || "{}") }; }
  catch (e) { return { chat: true, ind: true, sug: true }; }
}
function salvaQuais(q) { try { localStorage.setItem(PREF, JSON.stringify(q)); } catch (e) { /* ignora */ } }

const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const naTelaInicio = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

// "ok" | "negado" | "precisa-tela-inicio" | "sem-suporte" | "desligado"
export function estado() {
  if (!PUB || !("serviceWorker" in navigator)) return "sem-suporte";
  if (!("PushManager" in window) || !("Notification" in window)) return ios && !naTelaInicio() ? "precisa-tela-inicio" : "sem-suporte";
  if (Notification.permission === "denied") return "negado";
  if (Notification.permission === "granted") return localStorage.getItem(PREF + "_off") ? "desligado" : "ok";
  return "desligado";
}
export const ehIos = ios;

function chave(b64) {
  const p = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
async function assinatura(criar) {
  const reg = await navigator.serviceWorker.ready;
  let s = await reg.pushManager.getSubscription();
  if (!s && criar) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave(PUB) });
  return s;
}

// Liga (chamar dentro do toque!). Devolve true se ficou ligado.
export async function ligar() {
  if (estado() === "sem-suporte" || estado() === "precisa-tela-inicio") return false;
  const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (p !== "granted") return false;
  const s = await assinatura(true);
  await cloud.rpc("salvar_push", { assinatura: s.toJSON(), quais: quais() });
  try { localStorage.removeItem(PREF + "_off"); } catch (e) { /* ignora */ }
  return true;
}
export async function desligar() {
  try { localStorage.setItem(PREF + "_off", "1"); } catch (e) { /* ignora */ }
  try {
    const s = await assinatura(false);
    if (s) { await cloud.rpc("tirar_push", { ep: s.endpoint }).catch(() => {}); await s.unsubscribe(); }
  } catch (e) { /* ignora */ }
}
// Saiu da conta: tira este aparelho dos avisos (sem marcar como desligado).
export async function esquecer() {
  try {
    const s = "serviceWorker" in navigator && (await navigator.serviceWorker.getRegistration()) ? await assinatura(false) : null;
    if (s) { await cloud.rpc("tirar_push", { ep: s.endpoint }).catch(() => {}); await s.unsubscribe(); }
  } catch (e) { /* ignora */ }
}
export async function mudarQuais(q) {
  salvaQuais({ ...quais(), ...q });
  await sincronizar();
}
// Ao abrir o app: confirma a assinatura (pode ter mudado) e conta que abriu.
export async function sincronizar() {
  if (estado() !== "ok" || !cloud.currentUser() || !navigator.onLine) return;
  try {
    const s = await assinatura(true);
    if (s) await cloud.rpc("salvar_push", { assinatura: s.toJSON(), quais: quais() });
  } catch (e) { /* tenta na próxima */ }
}
// Bolinha com número no ícone do app.
export function numeroNoIcone(n) {
  try { if (n > 0) navigator.setAppBadge && navigator.setAppBadge(n); else navigator.clearAppBadge && navigator.clearAppBadge(); }
  catch (e) { /* ignora */ }
}
