// Sons e vibração do app. Tudo sintetizado na hora (Web Audio): sem arquivo, funciona offline.
// Respeita a chave do silencioso do iPhone e não para a música que estiver tocando.
const KEY = "cinemoteca_sons";
let cfg = { som: true, vibra: true };
try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) { /* ignora */ }
try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) { /* ignora */ }

export const ligado = () => cfg.som;
export const vibraLigado = () => cfg.vibra;
export function liga(campo, v) {
  cfg[campo] = !!v;
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignora */ }
}

let ctx = null, out = null, eco = null, ruido = null;
function ac() {
  if (!cfg.som) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    out = ctx.createGain(); out.gain.value = 0.55;
    out.connect(comp); comp.connect(ctx.destination);
    // ecozinho curto: dá um ar de "sala" nos sons de conquista
    const d = ctx.createDelay(); d.delayTime.value = 0.11;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    eco = ctx.createGain(); eco.gain.value = 0.22;
    eco.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(out);
    const n = ctx.sampleRate * 0.5, b = ctx.createBuffer(1, n, ctx.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    ruido = b;
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
// iPhone só libera áudio depois de um toque
const destrava = () => { if (cfg.som) ac(); };
window.addEventListener("pointerdown", destrava, { passive: true });
window.addEventListener("touchend", destrava, { passive: true });

let ultimo = 0; // som "de verdade" tocado agora há pouco: o clique genérico fica quieto
function marca() { ultimo = performance.now(); }

// nota simples com envelope suave
function tom(f, { t = 0, dur = 0.12, tipo = "sine", vol = 0.2, ate = null, fx = false, atk = 0.005 } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + t + 0.005;
  const o = c.createOscillator(), g = c.createGain();
  o.type = tipo; o.frequency.setValueAtTime(f, t0);
  if (ate) o.frequency.exponentialRampToValueAtTime(ate, t0 + dur * 0.9);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(out); if (fx) g.connect(eco);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
// sopro filtrado (abrir/fechar, deslizar)
function sopro({ t = 0, dur = 0.2, de = 500, ate = 1800, vol = 0.05, q = 1.2 } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + t + 0.005;
  const s = c.createBufferSource(); s.buffer = ruido;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
  f.frequency.setValueAtTime(de, t0); f.frequency.exponentialRampToValueAtTime(ate, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t0, Math.random() * 0.2); s.stop(t0 + dur + 0.05);
}
// estalinho (dado, tique)
function estalo(t = 0, f = 3200, vol = 0.12) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + t + 0.005;
  const s = c.createBufferSource(); s.buffer = ruido;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 6;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
  s.connect(bp); bp.connect(g); g.connect(out);
  s.start(t0, Math.random() * 0.3); s.stop(t0 + 0.05);
}

// ---------- vibração ----------
// iPhone (iOS 18+) não tem navigator.vibrate; o truque é tocar num "switch" escondido, que dá o tique do sistema.
let sw = null;
function vib(n = 1) {
  if (!cfg.vibra) return;
  if (navigator.vibrate) { navigator.vibrate(n > 1 ? [12, 60, 12] : 12); return; }
  if (!sw) {
    const l = document.createElement("label");
    l.setAttribute("aria-hidden", "true"); l.dataset.mudo = "1";
    l.style.cssText = "position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    const i = document.createElement("input"); i.type = "checkbox"; i.setAttribute("switch", ""); i.tabIndex = -1;
    l.appendChild(i); document.body.appendChild(l); sw = l;
  }
  sw.click();
  if (n > 1) setTimeout(() => sw && sw.click(), 90);
}

// ---------- os sons do app ----------
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

export function toque() { if (performance.now() - ultimo < 120) return; tom(1500, { dur: 0.03, vol: 0.045 }); tom(750, { dur: 0.025, vol: 0.03 }); }
export function aba() { marca(); tom(880, { dur: 0.05, vol: 0.05, ate: 1180 }); }
export function tique() { marca(); estalo(0, 2600, 0.07); vib(); }
export function abre() { marca(); sopro({ dur: 0.22, de: 380, ate: 1700, vol: 0.045 }); }
export function fecha() { marca(); sopro({ dur: 0.17, de: 1500, ate: 420, vol: 0.03 }); }
export function salvar() { // entrou em Quero ver: "pop" com brilhinho
  marca(); vib();
  tom(480, { dur: 0.1, vol: 0.18, ate: 900 });
  tom(1320, { t: 0.06, dur: 0.14, vol: 0.06, fx: true });
}
export function visto() { // marcou como visto: plim de dois tons
  marca(); vib();
  tom(783.99, { dur: 0.32, vol: 0.13, fx: true });
  tom(1174.66, { t: 0.085, dur: 0.45, vol: 0.12, fx: true });
  tom(2349, { t: 0.085, dur: 0.2, vol: 0.02 });
}
export function tirar() { marca(); vib(); tom(440, { dur: 0.2, vol: 0.12, ate: 170, tipo: "triangle" }); sopro({ dur: 0.22, de: 1400, ate: 300, vol: 0.035 }); }
export function desfazer() { marca(); tom(330, { dur: 0.16, vol: 0.11, ate: 660, tipo: "triangle" }); }
export function nota(n) { // quanto maior a nota, mais aguda
  marca(); vib();
  const f = PENTA[Math.max(1, Math.min(10, n)) - 1];
  tom(f, { dur: 0.3, vol: 0.13, fx: true });
  tom(f * 2, { dur: 0.12, vol: 0.025 });
  if (n >= 9) tom(f * 1.5, { t: 0.08, dur: 0.35, vol: 0.07, fx: true });
}
export function ep() { // +1 episódio: plique tipo moedinha, bem leve
  marca(); vib();
  tom(987.77, { dur: 0.07, vol: 0.09, tipo: "triangle" });
  tom(1318.51, { t: 0.055, dur: 0.16, vol: 0.08, tipo: "triangle", fx: true });
}
export function temporada() { // fechou a temporada: arpejo subindo
  marca(); vib(2);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tom(f, { t: i * 0.075, dur: 0.38, vol: 0.11, fx: true }));
}
export function fim() { // terminou a série: fanfarrinha
  marca(); vib(2);
  [523.25, 659.25, 783.99].forEach((f, i) => tom(f, { t: i * 0.09, dur: 0.22, vol: 0.1, tipo: "triangle" }));
  [1046.5, 1318.51, 1567.98].forEach(f => tom(f, { t: 0.3, dur: 0.9, vol: 0.07, fx: true }));
  tom(2093, { t: 0.3, dur: 0.5, vol: 0.02 });
}
export function dado() { // dado rolando e parando + plim do resultado
  marca(); vib();
  let t = 0;
  for (let i = 0; i < 7; i++) { estalo(t, 2400 + Math.random() * 1800, 0.11 - i * 0.008); t += 0.04 + i * 0.022; }
  tom(880, { t: t + 0.05, dur: 0.3, vol: 0.11, fx: true });
  tom(1318.51, { t: t + 0.12, dur: 0.45, vol: 0.1, fx: true });
  setTimeout(() => vib(), (t + 0.05) * 1000);
}
export function enviar() { marca(); vib(); tom(520, { dur: 0.2, vol: 0.1, ate: 1400 }); sopro({ dur: 0.25, de: 600, ate: 3200, vol: 0.035 }); }
export function erro() { marca(); tom(233, { dur: 0.1, vol: 0.1, tipo: "triangle" }); tom(196, { t: 0.12, dur: 0.14, vol: 0.1, tipo: "triangle" }); }
export function teste() { visto(); }

// Clique em qualquer botão que não tem som próprio: um "tic" bem baixinho.
document.addEventListener("click", e => {
  const el = e.target.closest && e.target.closest("button, a, .row, .res, label, [role=tab]");
  if (!el || el.closest("[data-mudo]") || el.disabled) return;
  toque();
});
