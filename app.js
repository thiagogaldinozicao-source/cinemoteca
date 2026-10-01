import * as tmdb from "./tmdb.js?v=22";
import * as store from "./store.js?v=22";
import * as now from "./now.js?v=22";
import * as cloud from "./cloud.js?v=22";
import * as gostos from "./gostos.js?v=22";
import * as amigos from "./amigos.js?v=22";

const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const sheet = $("#sheet");
const sheetBg = $("#sheetBg");

// ---------- utilidades ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const typeLabel = t => (t === "tv" ? "Série" : "Filme");
const nomeTipo = t => (t === "movie" ? "filmes" : t === "tv" ? "séries" : "títulos"); // filtro da aba

let toastTimer;
function toast(msg, acao, fn) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("act", !!acao);
  if (acao) {
    const b = document.createElement("button");
    b.textContent = acao;
    b.onclick = () => { t.classList.remove("show"); clearTimeout(toastTimer); fn(); };
    t.appendChild(b);
  }
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), acao ? 5000 : 2200);
}

// ---------- DESLIZAR NOS CARDS ----------
// Só no dedo (no mouse o card continua só clicável).
// opts: { right: {label, cls, fn}, left: {label, cls, fn} } — fn(card) é chamado ao soltar depois do limite.
let swipedAt = 0;
function swipeable(card, opts) {
  let x0 = 0, y0 = 0, dx = 0, dir = null, id = null, w = 0;
  const hint = document.createElement("span");
  hint.className = "swhint";
  card.appendChild(hint);
  const reset = () => {
    card.style.transition = "transform .2s"; card.style.transform = "";
    card.classList.remove("swR", "swL", "swOk");
    setTimeout(() => { card.style.transition = ""; }, 220);
  };
  card.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" || e.target.closest(".quick")) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; dir = null; w = card.offsetWidth;
  });
  card.addEventListener("pointermove", e => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!dir) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      dir = Math.abs(mx) > Math.abs(my) * 1.2 ? "h" : "v";
      if (dir === "h") { try { card.setPointerCapture(id); } catch (err) { /* ignora */ } }
    }
    if (dir !== "h") return;
    const side = mx > 0 ? opts.right : opts.left;
    dx = side ? mx : mx / 5; // lado sem ação: puxa só um pouquinho
    card.style.transform = `translateX(${dx}px)`;
    card.classList.toggle("swR", mx > 0 && !!opts.right);
    card.classList.toggle("swL", mx < 0 && !!opts.left);
    if (side) { hint.textContent = side.label; hint.className = "swhint " + (mx > 0 ? "l " : "r ") + (side.cls || ""); }
    card.classList.toggle("swOk", !!side && Math.abs(dx) > Math.min(110, w * 0.3));
  });
  const end = e => {
    if (e.pointerId !== id) return;
    id = null;
    if (dir !== "h") return;
    swipedAt = Date.now();
    const side = dx > 0 ? opts.right : opts.left;
    if (side && Math.abs(dx) > Math.min(110, w * 0.3)) {
      card.style.transition = "transform .18s"; card.style.transform = `translateX(${dx > 0 ? w : -w}px)`;
      setTimeout(() => { side.fn(card); reset(); }, 170);
    } else reset();
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
  // o clique que vem logo depois de deslizar não abre os detalhes
  card.addEventListener("click", e => { if (Date.now() - swipedAt < 350) { e.stopPropagation(); e.preventDefault(); } }, true);
}

// Nota rápida depois de marcar como visto.
function pedirNota(m) {
  let b = "";
  for (let k = 1; k <= 10; k++) b += `<button class="star" data-n="${k}">${k}</button>`;
  openSheet(`<div class="dbody notasheet">
    <div class="lbl">Já vi ✓</div>
    <h2>${esc(m.title)}</h2>
    <p class="muted">Que nota vc dá?</p>
    <div class="stars">${b}</div>
    <button class="btn ghost wide" id="semNota">Agora não</button>
  </div>`);
  sheet.querySelectorAll("[data-n]").forEach(x => x.onclick = () => { store.setNote(m.key, +x.dataset.n); closeSheet(); toast(`★ ${x.dataset.n}/10 pra ${m.title}`); });
  $("#semNota", sheet).onclick = closeSheet;
}

function posterHTML(m, size = "w342", cls = "poster") {
  const src = tmdb.img(m.poster, size);
  if (src) return `<img class="${cls}" src="${esc(src)}" alt="Capa de ${esc(m.title)}" data-title="${esc(m.title)}" loading="lazy" onerror="imgFail(this)">`;
  return `<div class="${cls} noimg"><span>${esc(m.title)}</span></div>`;
}
// Capa que não carregou vira uma capinha com o nome.
window.imgFail = el => {
  const d = document.createElement("div");
  d.className = el.className + " noimg";
  const sp = document.createElement("span");
  sp.textContent = el.dataset.title || "";
  d.appendChild(sp);
  el.replaceWith(d);
};
function verdictHTML(m) {
  const v = tmdb.verdict(m.vote, m.votes);
  const nota = m.vote != null && m.votes >= 50 ? ` · ${m.vote.toFixed(1)}` : "";
  return `<span class="verd ${v.cls}">${v.emoji} ${v.label}${nota}</span>`;
}
function errorText(e) {
  if (!e) return "Deu um problema. Tenta de novo.";
  if (e.kind === "login") return "Sua sessão venceu. Entra de novo em Ajustes.";
  if (e.kind === "no_function") return "A busca ainda não foi ligada no servidor (função tmdb).";
  if (e.kind === "server_key") return "A chave do TMDB no servidor não está funcionando.";
  if (e.kind === "network") return "Sem internet agora.";
  if (e.kind === "rate") return "Muitas buscas seguidas. Espera uns segundos.";
  return "Deu um problema na busca. Tenta de novo.";
}

// ---------- navegação ----------
let tab = "lista";
function go(name) {
  if (name !== "amigos" || tab === "amigos") amigoAberto = null;
  tab = name;
  document.querySelectorAll("nav.bottom button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
  render();
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
document.querySelectorAll("nav.bottom button").forEach(b => b.addEventListener("click", () => go(b.dataset.tab)));

function needLogin() { return cloud.enabled && !cloud.currentUser(); }
function render() {
  document.body.classList.toggle("auth", needLogin());
  if (needLogin()) { renderLogin(); return; }
  if (gostos.precisaPerguntar() || editandoGostos) { document.body.classList.add("auth"); renderGostos(); return; }
  view.dataset.tab = tab;
  if (tab === "lista") renderLista();
  else if (tab === "buscar") renderBuscar();
  else if (tab === "amigos") renderAmigos();
  else renderAjustes();
}
let editandoGostos = false;
let escolha = null; // { generos:Set, tipo, mexeu }
function naPergunta() { return !needLogin() && (gostos.precisaPerguntar() || editandoGostos); }
store.onChange(() => {
  if (naPergunta()) {
    // A lista chegou depois de abrir o questionário: refaz o palpite se a pessoa ainda não mexeu.
    if (escolha && !escolha.mexeu && !editandoGostos) { escolha = null; renderGostos(); }
    return;
  }
  if (!needLogin() && tab === "lista") renderLista();
  else if (!needLogin() && tab === "amigos") renderAmigos();
});

// Entrou/saiu da conta: redesenha tudo. Só mudou o status da nuvem: atualiza Ajustes.
let wasLogged = !!cloud.currentUser();
cloud.onChange(() => {
  const logged = !!cloud.currentUser();
  if (logged !== wasLogged) {
    wasLogged = logged; closeSheet(); tab = "lista"; gostos.reset(); go("lista");
    amigos.reset();
    if (logged) { gostos.carregar(); amigos.carregar(); setTimeout(() => { abrirIndicado(); abrirConvite(); }, 300); }
    return;
  }
  if (!needLogin() && tab === "ajustes") { const el = $("#syncLine"); if (el) el.innerHTML = syncText(); }
});
window.addEventListener("cinemoteca:migrou", e => {
  const { total, pending } = e.detail || {};
  toast(pending ? `Sua lista (${total}) vai subir pra nuvem quando tiver internet` : `✅ Sua lista (${total}) subiu pra nuvem`);
});

// ---------- GOSTOS (questionário estilo Spotify) ----------
gostos.onChange(() => { if (naPergunta() && !$(".gostos")) render(); else setTimeout(() => mostrarTutorial(), 400); });
function renderGostos() {
  const atual = gostos.get();
  if (!escolha) {
    const base = atual && atual.generos && atual.generos.length ? atual.generos : gostos.palpite();
    escolha = { generos: new Set(base), tipo: (atual && atual.tipo) || "ambos" };
  }
  const n = escolha.generos.size;
  view.innerHTML = `
    <div class="gostos">
      <div class="empty-emoji">🍿</div>
      <h2>Do que vc curte?</h2>
      <p class="muted">Toca nos gêneros que vc gosta. Na 🔍 busca eu te indico filmes e séries disso.${!editandoGostos && store.all().length && n ? "<br>Já marquei alguns pelo que tem na sua lista." : ""}</p>
      <div class="gchips">
        ${gostos.GENEROS.map(g => `<button class="gchip ${escolha.generos.has(g.id) ? "on" : ""}" data-g="${g.id}"><span>${g.emoji}</span>${esc(g.label)}</button>`).join("")}
      </div>
      <div class="lbl center">Prefere…</div>
      <div class="seg gtipo">
        ${[["movie", "Filmes"], ["tv", "Séries"], ["ambos", "Os dois"]].map(([k, l]) => `<button class="${escolha.tipo === k ? "on" : ""}" data-t="${k}">${l}</button>`).join("")}
      </div>
      <div class="gfoot">
        <button class="btn gold wide" id="gOk" ${n ? "" : "disabled"}>${n ? `Pronto (${n})` : "Escolhe pelo menos 1"}</button>
        <button class="btn ghost wide" id="gSkip">${editandoGostos ? "Cancelar" : "Pular por agora"}</button>
      </div>
    </div>`;
  view.querySelectorAll("[data-g]").forEach(b => b.onclick = () => {
    const id = b.dataset.g;
    escolha.generos.has(id) ? escolha.generos.delete(id) : escolha.generos.add(id);
    escolha.mexeu = true;
    const top = window.scrollY; renderGostos(); window.scrollTo(0, top);
  });
  view.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { escolha.tipo = b.dataset.t; escolha.mexeu = true; const top = window.scrollY; renderGostos(); window.scrollTo(0, top); });
  $("#gOk").onclick = () => {
    const eraEdicao = editandoGostos;
    editandoGostos = false;
    gostos.salvar([...escolha.generos], escolha.tipo);
    escolha = null;
    document.body.classList.remove("auth");
    searchQuery = "";
    toast(eraEdicao ? "Gostos atualizados!" : "Prontinho! Olha as indicações pra você 🍿");
    go("buscar");
    if (!eraEdicao) setTimeout(mostrarTutorial, 600);
  };
  $("#gSkip").onclick = () => {
    const eraEdicao = editandoGostos;
    editandoGostos = false; escolha = null;
    if (!eraEdicao) gostos.salvar([], "ambos", true);
    document.body.classList.remove("auth");
    go(eraEdicao ? "ajustes" : "lista");
    if (!eraEdicao) setTimeout(mostrarTutorial, 400);
  };
}
function editarGostos() { editandoGostos = true; escolha = null; closeSheet(); render(); window.scrollTo(0, 0); }

// ---------- ENTRAR (login por código no e-mail) ----------
let loginEmail = "";
let loginStep = "email";
function renderLogin() {
  document.querySelectorAll("nav.bottom button").forEach(b => b.classList.remove("on"));
  if (loginStep === "email") {
    view.innerHTML = `
      <div class="empty login">
        <div class="empty-emoji">🎬</div>
        <h2>Entra pra guardar sua lista</h2>
        <p>Sua lista fica salva na sua conta: igual no celular e no computador, e só você vê. Sem senha: a gente manda um código pro seu e-mail.</p>
        <form id="fEmail" class="lform">
          <input id="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="seu@email.com" value="${esc(loginEmail)}" aria-label="Seu e-mail" required>
          <button class="btn gold wide" id="send">Receber código</button>
        </form>
        ${store.all().length ? `<p class="tiny">A lista que já está neste aparelho (${store.all().length} títulos) vai junto pra sua conta.</p>` : ""}
      </div>`;
    const email = $("#email");
    $("#fEmail").onsubmit = async e => {
      e.preventDefault();
      const v = email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast("Confere o e-mail."); return; }
      const b = $("#send"); b.disabled = true; b.textContent = "Enviando…";
      try { await cloud.sendCode(v); loginEmail = v; loginStep = "code"; renderLogin(); }
      catch (err) { toast(loginError(err)); b.disabled = false; b.textContent = "Receber código"; }
    };
    if (!loginEmail) setTimeout(() => email.focus(), 50);
    return;
  }
  view.innerHTML = `
    <div class="empty login">
      <div class="empty-emoji">📬</div>
      <h2>Olha seu e-mail</h2>
      <p>Mandei um código pra <b>${esc(loginEmail)}</b>. Digita ele aqui.<br><span class="muted">Não chegou? Olha no Spam ou Promoções.</span></p>
      <form id="fCode" class="lform">
        <input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="8" placeholder="Código" aria-label="Código do e-mail" class="code" required>
        <button class="btn gold wide" id="enter">Entrar</button>
      </form>
      <div class="row2">
        <button class="btn ghost" id="again">Mandar de novo</button>
        <button class="btn ghost" id="other">Trocar e-mail</button>
      </div>
    </div>`;
  const code = $("#code");
  setTimeout(() => code.focus(), 50);
  const submit = async () => {
    const v = code.value.replace(/\D/g, "");
    if (v.length < 6) { toast("O código tem 6 números (ou mais)."); return; }
    const b = $("#enter"); b.disabled = true; b.textContent = "Entrando…";
    try { await cloud.verifyCode(loginEmail, v); toast("Pronto, você entrou! 🎉"); loginStep = "email"; }
    catch (err) { toast("Código errado ou vencido. Confere ou pede outro."); b.disabled = false; b.textContent = "Entrar"; }
  };
  $("#fCode").onsubmit = e => { e.preventDefault(); submit(); };
  $("#again").onclick = async () => {
    try { await cloud.sendCode(loginEmail); toast("Mandei outro código."); } catch (err) { toast(loginError(err)); }
  };
  $("#other").onclick = () => { loginStep = "email"; renderLogin(); };
}
function loginError(err) {
  const m = String((err && err.message) || "").toLowerCase();
  if (!navigator.onLine || (err && err.offline)) return "Sem internet agora. Tenta de novo quando conectar.";
  if ((err && err.status === 429) || m.includes("rate") || m.includes("seconds")) return "Muitos e-mails em pouco tempo. Espera uns minutos e tenta de novo.";
  if (m.includes("signups not allowed")) return "Cadastro de contas novas está desligado.";
  if (m.includes("not authorized") || m.includes("not allowed")) return "Esse e-mail ainda não está liberado no app.";
  return "Não consegui mandar o código. Tenta de novo.";
}

// ---------- MINHA LISTA ----------
let listSeg = "want";
let listType = "all";
function renderLista() {
  const items = store.all();
  const want = items.filter(i => i.status === "want").sort(store.byQuality);
  const seen = items.filter(i => i.status === "seen").sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0));
  const src = (listSeg === "want" ? want : seen).filter(i => listType === "all" || i.type === listType);

  if (!items.length) {
    view.innerHTML = `
      <div class="empty">
        <div class="empty-emoji">🍿</div>
        <h2>Sua lista tá vazia</h2>
        <p>Viu uma indicação no Instagram ou um amigo falou de um filme? Busca aqui, eu te digo se vale a pena e você anota pra não esquecer.</p>
        <button class="btn gold" id="goSearch">🔍 Buscar filme ou série</button>
      </div>`;
    $("#goSearch").onclick = () => go("buscar");
    return;
  }

  view.innerHTML = `
    <div class="lhead">
    ${want.length ? `<button class="nowbar" id="nowBtn"><span>🍿 <b>O que ver agora?</b></span><span class="nowslot">${esc(now.slotFor().label)} ›</span></button>` : ""}
    <div class="seg" role="tablist">
      <button role="tab" class="${listSeg === "want" ? "on" : ""}" data-seg="want">Quero ver <b>${want.length}</b></button>
      <button role="tab" class="${listSeg === "seen" ? "on" : ""}" data-seg="seen">Já vi <b>${seen.length}</b></button>
    </div>
    <div class="chips">
      ${[["all", "Tudo"], ["movie", "Filmes"], ["tv", "Séries"]].map(([k, l]) => `<button class="chip ${listType === k ? "on" : ""}" data-type="${k}">${l}</button>`).join("")}
    </div>
    </div>
    ${src.length ? `<ol class="queue">${src.map((m, k) => rowHTML(m, k, src.length)).join("")}</ol>`
      : `<p class="muted center pad">${listSeg === "want" ? "Nada aqui nesse filtro." : "Quando marcar algo como visto, aparece aqui."}</p>`}
  `;
  const nb = $("#nowBtn"); if (nb) nb.onclick = openNow;
  view.querySelectorAll("[data-seg]").forEach(b => b.onclick = () => { listSeg = b.dataset.seg; renderLista(); });
  view.querySelectorAll("[data-type]").forEach(b => b.onclick = () => { listType = b.dataset.type; renderLista(); });
  view.querySelectorAll(".row").forEach(r => {
    r.onclick = e => {
      const it = store.get(r.dataset.key);
      if (it) openDetails(it);
    };
    const key = r.dataset.key;
    swipeable(r, {
      right: listSeg === "want" ? { label: "✓ Já vi", cls: "ok", fn: () => {
        const it = store.get(key); if (!it) return;
        store.setStatus(key, "seen"); pedirNota(it);
      } } : null,
      left: { label: "Tirar 🗑", cls: "bad", fn: () => {
        const it = store.get(key); if (!it) return;
        const copia = JSON.parse(JSON.stringify(it));
        store.remove(key);
        toast(`${it.title} saiu da lista`, "Desfazer", () => { store.restore(copia); toast("Voltou pra lista"); });
      } },
    });
  });
}
function rowHTML(m, k, n) {
  const seen = m.status === "seen";
  return `
    <li class="row" data-key="${esc(m.key)}">
      <span class="pos">${seen ? "✓" : k + 1}</span>
      ${posterHTML(m, "w185", "thumb")}
      <div class="rinfo">
        <div class="rtitle">${esc(m.title)}</div>
        <div class="rmeta">${typeLabel(m.type)}${m.year ? " · " + esc(m.year) : ""}${m.note ? ` · <span class="mine">★ ${m.note}/10</span>` : ""}</div>
        ${m.memo ? `<div class="rmemo">📝 ${esc(m.memo)}</div>` : ""}
        ${verdictHTML(m)}
      </div>
    </li>`;
}

// ---------- BUSCAR ----------
let searchQuery = "";
let praFiltro = null; // um gênero só no "Pra você" (null = todos)
let searchCtl = null;
let searchTimer = null;
function renderBuscar() {
  view.innerHTML = `
    <div class="searchbar">
      <span>🔍</span>
      <input id="q" type="search" inputmode="search" autocomplete="off" placeholder="Filme, série ou nome do ator…" value="${esc(searchQuery)}" aria-label="Buscar filme ou série">
    </div>
    <div id="results"></div>`;
  const q = $("#q");
  q.addEventListener("input", () => {
    searchQuery = q.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 350);
  });
  q.addEventListener("keydown", e => { if (e.key === "Enter") { clearTimeout(searchTimer); runSearch(); q.blur(); } });
  runSearch();
  if (!searchQuery) setTimeout(() => q.focus(), 50);
}
async function runSearch() {
  const box = $("#results");
  if (!box) return;
  if (searchCtl) searchCtl.abort();
  const ctl = new AbortController(); searchCtl = ctl;
  const query = searchQuery.trim();
  if (!tmdb.ready()) {
    box.innerHTML = `<div class="notice">Entra na sua conta pra buscar. <button class="link" id="goCfg">Ir pra Ajustes</button></div>`;
    $("#goCfg").onclick = () => go("ajustes");
    return;
  }
  box.innerHTML = `<p class="muted center pad">${query ? "Procurando…" : "Separando umas indicações…"}</p>`;
  try {
    let list, pra = [];
    if (query) list = await tmdb.search(query, { signal: ctl.signal });
    else {
      const g = gostos.get();
      const temGostos = g && g.generos && g.generos.length;
      [pra, list] = await Promise.all([
        temGostos ? gostos.praVoce(praFiltro, { signal: ctl.signal }).catch(e => { if (e.name === "AbortError") throw e; return []; }) : [],
        tmdb.trending({ signal: ctl.signal }),
      ]);
    }
    if (ctl !== searchCtl) return;
    if (query && !list.length) { box.innerHTML = `<p class="muted center pad">Não achei nada com "${esc(query)}". Tenta o nome em inglês, só uma parte do nome ou o nome de um ator.</p>`; return; }
    const g = gostos.get();
    const praHTML = !query && g && g.generos && g.generos.length ? `
      <h3 class="sec">🍿 Pra você</h3>
      <div class="chips pchips">
        <button class="chip ${!praFiltro ? "on" : ""}" data-pf="">Tudo que curto</button>
        ${g.generos.map(id => `<button class="chip ${praFiltro === id ? "on" : ""}" data-pf="${id}">${esc(gostos.label(id))}</button>`).join("")}
      </div>
      ${pra.length ? `<ul class="results">${pra.map(resultHTML).join("")}</ul>` : `<p class="muted pad">Nada novo nesse gênero agora. Tenta outro 😉</p>`}` : "";
    const convite = !query && !(g && g.generos && g.generos.length) && cloud.enabled
      ? `<button class="nowbar" id="setG"><span>🍿 <b>Me conta do que vc curte</b> e eu te indico filmes</span><span class="nowslot">›</span></button>` : "";
    box.innerHTML = `${convite}${praHTML}${query ? "" : `<h3 class="sec">🔥 Em alta essa semana</h3>`}
      <ul class="results">${list.map(resultHTML).join("")}</ul>`;
    const sg = $("#setG"); if (sg) sg.onclick = editarGostos;
    box.querySelectorAll("[data-pf]").forEach(b => b.onclick = () => { praFiltro = b.dataset.pf || null; runSearch(); });
    const all = pra.concat(list);
    box.querySelectorAll(".res").forEach(el => {
      const m = all.find(x => x.key === el.dataset.key);
      const marcar = (status, msg) => {
        if (store.get(m.key)) store.setStatus(m.key, status); else store.add(m, status);
        const q = el.querySelector(".quick");
        if (q) { q.textContent = status === "seen" ? "✓ Visto" : "✓ Na lista"; q.classList.add("done"); q.disabled = true; }
        toast(msg);
      };
      if (m) swipeable(el, {
        right: { label: "＋ Quero ver", cls: "gold", fn: () => marcar("want", `${m.title} entrou em Quero ver`) },
        left: { label: "✓ Já vi", cls: "ok", fn: () => marcar("seen", `${m.title} marcado como visto`) },
      });
      el.onclick = e => {
        if (e.target.closest(".quick")) { e.stopPropagation(); quickAdd(m, el); return; }
        openDetails(m);
      };
    });
  } catch (e) {
    if (e.name === "AbortError") return;
    if (ctl !== searchCtl) return;
    box.innerHTML = `<div class="notice">${esc(errorText(e))}${e.kind === "login" ? ` <button class="link" id="goCfg">Ir pra Ajustes</button>` : ""}</div>`;
    const g = $("#goCfg"); if (g) g.onclick = () => go("ajustes");
  }
}
function resultHTML(m) {
  const saved = store.get(m.key);
  const state = saved ? (saved.status === "seen" ? "✓ Visto" : "✓ Na lista") : "＋";
  return `
    <li class="res" data-key="${esc(m.key)}">
      ${posterHTML(m, "w185", "thumb")}
      <div class="rinfo">
        <div class="rtitle">${esc(m.title)}</div>
        <div class="rmeta">${typeLabel(m.type)}${m.year ? " · " + esc(m.year) : ""}${m.original ? " · " + esc(m.original) : ""}</div>
        ${m.via ? `<div class="via">com ${esc(m.via)}</div>` : ""}
        ${verdictHTML(m)}
      </div>
      <button class="quick ${saved ? "done" : ""}" aria-label="${saved ? "Já está na lista" : "Adicionar em Quero ver"}" ${saved ? "disabled" : ""}>${state}</button>
    </li>`;
}
function quickAdd(m, el) {
  if (store.get(m.key)) return;
  if (!store.add(m, "want")) { toast("Não consegui salvar no aparelho."); return; }
  const b = el.querySelector(".quick");
  b.textContent = "✓ Na lista"; b.classList.add("done"); b.disabled = true;
  toast(`${m.title} entrou em Quero ver`);
}

// ---------- DETALHES (folha de baixo) ----------
let detailsCtl = null;
let sheetToken = 0;
// Topo da folha de baixo (alça + botão fechar).
const SHEET_TOP = `<div class="grab"></div><div class="closebar"><button class="close" aria-label="Fechar">×</button></div>`;
function openSheet(html) {
  sheetToken++;
  sheet.innerHTML = `${SHEET_TOP}${html}`;
  sheet.scrollTop = 0;
  document.body.classList.add("sheet-open");
  $(".close", sheet).onclick = closeSheet;
}
function closeSheet() {
  tutoAberto = false;
  if (detailsCtl) { detailsCtl.abort(); detailsCtl = null; }
  document.body.classList.remove("sheet-open");
}
sheetBg.onclick = closeSheet;
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeSheet();
  // No computador: "/" abre a busca.
  const typing = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || "");
  if (e.key === "/" && !typing && !needLogin() && !document.body.classList.contains("sheet-open")) {
    e.preventDefault();
    if (tab !== "buscar") go("buscar"); else { const q = $("#q"); if (q) q.focus(); }
  }
});

async function openDetails(m) {
  openSheet(detailsHTML(m, null));
  wireDetails(m);
  if (!tmdb.ready()) return;
  if (detailsCtl) detailsCtl.abort();
  const ctl = new AbortController(); detailsCtl = ctl;
  try {
    const d = await tmdb.details(m.type, m.id, { signal: ctl.signal });
    if (ctl !== detailsCtl || !document.body.classList.contains("sheet-open")) return;
    if (store.get(d.key)) store.setMeta(d.key, { runtime: d.runtime, epRuntime: d.epRuntime, genreIds: d.genreIds });
    const top = sheet.scrollTop;
    sheet.innerHTML = `${SHEET_TOP}${detailsHTML(d, d)}`;
    $(".close", sheet).onclick = closeSheet;
    sheet.scrollTop = top;
    wireDetails(d);
  } catch (e) {
    if (e.name === "AbortError") return;
    const slot = $("#dslot", sheet);
    if (slot) slot.innerHTML = `<p class="muted">${esc(errorText(e))}</p>`;
  }
}

function detailsHTML(m, d) {
  const saved = store.get(m.key);
  const meta = [typeLabel(m.type), m.year,
    d && d.runtime ? `${Math.floor(d.runtime / 60)}h${String(d.runtime % 60).padStart(2, "0")}` : "",
    d && d.seasons ? `${d.seasons} temporada${d.seasons > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
  const bd = tmdb.img(m.backdrop, "w780");
  let actions;
  if (!saved) actions = `
    <button class="btn gold" data-act="want">＋ Quero ver</button>
    <button class="btn" data-act="seen">✓ Já vi</button>`;
  else if (saved.status === "want") actions = `
    <button class="btn green" data-act="seen">✓ Marcar como visto</button>
    <button class="btn ghost" data-act="remove">Tirar da lista</button>`;
  else actions = `
    <button class="btn" data-act="want">↩︎ Quero ver de novo</button>
    <button class="btn ghost" data-act="remove">Tirar da lista</button>`;

  let stars = "";
  if (saved && saved.status === "seen") {
    for (let k = 1; k <= 10; k++) stars += `<button class="star ${saved.note >= k ? "on" : ""}" data-note="${k}" aria-label="Nota ${k}">${k}</button>`;
  }

  return `
    <div class="hero" ${bd ? `style="background-image:linear-gradient(180deg,rgba(10,10,15,.1),#14141d 92%),url('${esc(bd)}')"` : ""}>
      ${posterHTML(m, "w342", "dposter")}
      <div class="htxt">
        <h2>${esc(m.title)}</h2>
        ${m.original ? `<div class="orig">${esc(m.original)}</div>` : ""}
        <div class="rmeta">${esc(meta)}</div>
        ${verdictHTML(m)}
      </div>
    </div>
    <div class="dbody">
      <p class="why">${esc(tmdb.verdict(m.vote, m.votes).why)}${m.vote != null && m.votes >= 50 ? ` <span class="muted">Nota ${m.vote.toFixed(1)} de ${m.votes.toLocaleString("pt-BR")} pessoas.</span>` : ""}</p>
      ${indicadoPorHTML(m)}
      <div class="actions">${actions}</div>
      ${cloud.enabled && cloud.currentUser() && m.id ? `<button class="btn ghost wide indbtn" data-ind>👥 Indicar pra um amigo</button>` : ""}
      ${saved ? `<div class="lbl">Sua anotação</div>
        <textarea class="memo" id="memo" rows="2" maxlength="300" placeholder="Quem indicou, onde viu, com quem quer ver…">${esc(saved.memo || "")}</textarea>` : ""}
      ${stars ? `<div class="lbl">Sua nota${saved.note ? " — " + saved.note + "/10" : ""}</div><div class="stars">${stars}</div>` : ""}
      ${d && d.genres.length ? `<div class="tags">${d.genres.map(g => `<span class="tag">${esc(g)}</span>`).join("")}</div>` : ""}
      ${m.overview ? `<div class="lbl">Sinopse${m.overviewLang === "en" ? " <span class=\"lang\">(só tem em inglês)</span>" : ""}</div><p class="syn">${esc(m.overview)}</p>` : (d ? `<p class="muted">Ainda não tem sinopse cadastrada.</p>` : "")}
      ${d && d.trailerKey ? trailerHTML(d) : ""}
      <div id="dslot">${d ? providersHTML(d) + creditsHTML(d) + recsHTML(d) : `<p class="muted">Carregando onde assistir…</p>`}</div>
    </div>`;
}
function providersHTML(d) {
  const p = d.providers;
  const group = (title, arr) => arr.length ? `
    <div class="pgroup"><span class="plbl">${title}</span>
      <div class="plogos">${arr.map(x => `<img src="${esc(tmdb.img(x.logo, "w92"))}" alt="${esc(x.name)}" title="${esc(x.name)}">`).join("")}</div>
    </div>` : "";
  const any = p.stream.length || p.rent.length || p.buy.length;
  return `
    <div class="lbl">Onde assistir no Brasil</div>
    ${any ? group("Assinatura", p.stream) + group("Alugar", p.rent) + group("Comprar", p.buy)
      : `<p class="muted">Ainda não está em nenhum streaming no Brasil${d.type === "movie" ? " (pode estar só no cinema)" : ""}.</p>`}
    ${p.link ? `<a class="btn ghost wide" href="${esc(p.link)}" target="_blank" rel="noopener">Ver todas as opções e preços</a>` : ""}
    <p class="tiny">Dados de onde assistir: JustWatch</p>`;
}
function trailerHTML(d) {
  const k = encodeURIComponent(d.trailerKey);
  return `
    <div class="lbl">Trailer</div>
    <button class="trailer" data-trailer="${k}" aria-label="Tocar trailer de ${esc(d.title)}">
      <img src="https://i.ytimg.com/vi/${k}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">
      <span class="play">▶</span>
    </button>
    <a class="tiny ytlink" href="${esc(d.trailer)}" target="_blank" rel="noopener">Abrir no YouTube</a>`;
}
function creditsHTML(d) {
  const parts = [];
  if (d.director.length) parts.push(`<div><span class="plbl">${d.type === "tv" ? "Criação" : "Direção"}</span> ${esc(d.director.join(", "))}</div>`);
  if (d.cast.length) parts.push(`<div><span class="plbl">Elenco</span> ${esc(d.cast.join(", "))}</div>`);
  return parts.length ? `<div class="credits">${parts.join("")}</div>` : "";
}
function recsHTML(d) {
  if (!d.recs.length) return "";
  return `
    <div class="lbl">Se curtir, veja também</div>
    <div class="recs">${d.recs.map(r => `<button class="rec" data-rec="${esc(r.key)}">${posterHTML(r, "w185", "rposter")}<span>${esc(r.title)}</span></button>`).join("")}</div>`;
}
// ---------- TUTORIAL (primeira vez no aparelho) ----------
const TUTO_KEY = "cinemoteca_tutorial_visto";
const TUTO = [
  ["🔍", "Busca qualquer filme ou série", "Toca na lupa e digita o nome. Eu te digo se vale a pena e onde assistir."],
  ["👉", "Arrasta pro lado", "Na busca: pra direita vai pro <b>Quero ver</b>, pra esquerda marca <b>Já vi</b>.<br>Na sua lista: direita = <b>Já vi</b>, esquerda = <b>tirar</b>."],
  ["🎲", "Não sabe o que ver?", "O <b>dado</b> lá em cima sorteia da sua lista.<br>O <b>O que ver agora?</b> sugere pelo dia e horário."],
  ["📤", "Indica pros amigos", "Abre um filme e toca no botão de compartilhar pra mandar no WhatsApp."],
];
// Visto fica guardado no aparelho E na conta: não repete nem trocando de celular.
function tutoVisto() { try { if (localStorage.getItem(TUTO_KEY)) return true; } catch (e) { return true; } return gostos.tutorialVisto(); }
let tutoAberto = false;
function mostrarTutorial(forcar) {
  if (!forcar) {
    if (tutoAberto || needLogin() || naPergunta() || tutoVisto()) return;
    if (cloud.enabled && gostos.get() === undefined) return; // ainda não sei se já viu em outro aparelho
    if (document.body.classList.contains("sheet-open")) return;
    // marca na hora: mesmo fechando o app no meio, não aparece de novo
    try { localStorage.setItem(TUTO_KEY, "1"); } catch (e) { /* ignora */ }
    gostos.marcarTutorial();
  }
  tutoAberto = true;
  let i = 0;
  const passo = () => {
    const [emo, tit, txt] = TUTO[i];
    openSheet(`<div class="dbody tuto">
      <div class="tuto-emo">${emo}</div>
      <h2>${tit}</h2>
      <p>${txt}</p>
      <div class="tuto-dots">${TUTO.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("")}</div>
      <button class="btn gold wide" id="tNext">${i < TUTO.length - 1 ? "Próximo" : "Bora começar! 🍿"}</button>
      ${i < TUTO.length - 1 ? `<button class="btn ghost wide" id="tSkip">Pular</button>` : ""}
    </div>`);
    const fim = () => { tutoAberto = false; closeSheet(); };
    $("#tNext", sheet).onclick = () => { if (++i < TUTO.length) passo(); else fim(); };
    const sk = $("#tSkip", sheet); if (sk) sk.onclick = fim;
    $(".close", sheet).onclick = fim;
  };
  passo();
}

// ---------- INDICAR (compartilhar do celular) ----------
function linkDe(m) { return location.origin + location.pathname + "?t=" + encodeURIComponent(m.key); }
async function indicar(m) {
  const v = tmdb.verdict(m.vote, m.votes);
  const nota = m.vote != null && m.votes >= 50 ? ` · ${m.vote.toFixed(1)}` : "";
  const txt = `🎬 Te indico: ${m.title}${m.year ? ` (${m.year})` : ""}\n${v.emoji} ${v.label}${nota}`;
  const url = linkDe(m);
  if (navigator.share) {
    try { await navigator.share({ title: m.title, text: txt, url }); } catch (e) { /* cancelou */ }
    return;
  }
  try { await navigator.clipboard.writeText(txt + "\n" + url); toast("Copiado! É só colar no WhatsApp"); }
  catch (e) { prompt("Copia e manda:", txt + " " + url); }
}
// Abriu por um link de indicação (?t=movie:123): mostra o título.
function abrirIndicado() {
  let key = new URLSearchParams(location.search).get("t");
  try {
    if (key) sessionStorage.setItem("cinemoteca_indicado", key);
    else key = sessionStorage.getItem("cinemoteca_indicado");
  } catch (e) { /* ignora */ }
  if (key && location.search) history.replaceState(null, "", location.pathname);
  const mm = /^(movie|tv):(\d+)$/.exec(key || "");
  if (!mm || needLogin() || !tmdb.ready()) return;
  try { sessionStorage.removeItem("cinemoteca_indicado"); } catch (e) { /* ignora */ }
  const saved = store.get(key);
  openDetails(saved || { key, type: mm[1], id: +mm[2], title: "Carregando…", votes: 0, vote: null });
}

function wireDetails(m) {
  const cb = $(".closebar", sheet);
  if (cb && m.id && !cb.querySelector(".share")) {
    const b = document.createElement("button");
    b.className = "close share"; b.setAttribute("aria-label", "Indicar pra alguém");
    b.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
    b.onclick = () => indicar(m);
    cb.appendChild(b);
  }
  const ib = sheet.querySelector("[data-ind]");
  if (ib) ib.onclick = () => sheetIndicar(m);
  sheet.querySelectorAll("[data-act]").forEach(b => b.onclick = () => {
    const act = b.dataset.act;
    const saved = store.get(m.key);
    let ok = true;
    if (act === "want") { ok = saved ? store.setStatus(m.key, "want") : store.add(m, "want"); if (ok) toast("Salvo em Quero ver. Quer anotar quem indicou?"); }
    if (act === "seen") { ok = saved ? store.setStatus(m.key, "seen") : store.add(m, "seen"); if (ok) toast("Marcado como visto. Dá uma nota!"); }
    if (act === "remove") {
      if (!confirm(`Tirar ${m.title} da sua lista?`)) return;
      ok = store.remove(m.key); if (ok) toast("Tirado da lista");
    }
    if (!ok) { toast("Não consegui salvar no aparelho."); return; }
    refreshSheet(m);
    if (tab === "buscar") runSearch();
  });
  sheet.querySelectorAll("[data-note]").forEach(b => b.onclick = () => {
    const k = +b.dataset.note;
    const saved = store.get(m.key);
    store.setNote(m.key, saved && saved.note === k ? 0 : k);
    refreshSheet(m);
  });
  const memo = sheet.querySelector("#memo");
  if (memo) {
    let t;
    const save = () => { clearTimeout(t); if (store.get(m.key)) store.setMemo(m.key, memo.value.trim()); };
    memo.addEventListener("input", () => { clearTimeout(t); t = setTimeout(save, 600); });
    memo.addEventListener("blur", save);
  }
  const tr = sheet.querySelector("[data-trailer]");
  if (tr) tr.onclick = () => {
    const f = document.createElement("iframe");
    f.src = `https://www.youtube-nocookie.com/embed/${tr.dataset.trailer}?autoplay=1&playsinline=1&rel=0`;
    f.title = "Trailer";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.allowFullscreen = true;
    f.className = "trailer-frame";
    tr.replaceWith(f);
  };
  const d = m.recs ? m : null;
  sheet.querySelectorAll("[data-rec]").forEach(b => b.onclick = () => {
    const r = d && d.recs.find(x => x.key === b.dataset.rec);
    if (r) openDetails(r);
  });
}
function refreshSheet(m) {
  const top = sheet.scrollTop;
  const d = m.providers ? m : null;
  sheet.innerHTML = `${SHEET_TOP}${detailsHTML(m, d)}`;
  $(".close", sheet).onclick = closeSheet;
  sheet.scrollTop = top;
  wireDetails(m);
}

// ---------- AMIGOS ----------
let amigoAberto = null;   // { id, nome, dados, indiquei, seg, erro }
const iniciais = n => (String(n || "?").trim().split(/\s+/).map(p => p[0]).join("").slice(0, 2) || "?").toUpperCase();
// Foto (se tiver) por cima das iniciais; se a foto não carregar, ficam as iniciais.
const avatarHTML = (nome, cls = "", foto = null) => `<span class="av ${cls}" style="--h:${[...String(nome)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360}">${esc(iniciais(nome))}${foto ? `<img src="${esc(amigos.fotoUrl(foto))}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}</span>`;
function quando(ts) {
  const d = (Date.now() - new Date(ts).getTime()) / 864e5;
  if (d < 1) return "hoje"; if (d < 2) return "ontem"; if (d < 30) return `há ${Math.floor(d)} dias`;
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// Numerozinho na aba Amigos.
function badge() {
  const b = $('nav.bottom [data-tab="amigos"]'); if (!b) return;
  let s = b.querySelector(".badge");
  const n = amigos.novas();
  if (!n) { if (s) s.remove(); return; }
  if (!s) { s = document.createElement("span"); s.className = "badge"; b.appendChild(s); }
  s.textContent = n > 9 ? "9+" : n;
}
amigos.onChange(() => {
  badge();
  if (tab === "amigos" && !needLogin() && !naPergunta() && !amigoAberto) renderAmigos();
});
amigos.onNovas(lista => {
  if (tab === "amigos" && !amigoAberto) return;
  const i = lista[0];
  const txt = lista.length > 1 ? `🎬 Chegaram ${lista.length} indicações de amigos` : `🎬 ${i.nome} te indicou ${i.data.title}`;
  toast(txt, "Ver", () => go("amigos"));
});

function renderAmigos() {
  if (amigoAberto) { renderAmigo(); return; }
  const p = amigos.getPerfil(), lista = amigos.getAmigos(), caixa = amigos.pendentes();
  if (!p) {
    view.innerHTML = `<h2 class="h">Amigos</h2><p class="muted center pad">${amigos.falhou() ? "📴 Precisa de internet pra abrir seus amigos na primeira vez." : "Carregando…"}</p>`;
    if (amigos.falhou()) { const r = document.createElement("button"); r.className = "btn wide"; r.textContent = "Tentar de novo"; r.onclick = () => amigos.carregar(); view.appendChild(r); }
    return;
  }
  const nomeOk = amigos.nomeConfirmado();
  view.innerHTML = `
    <h2 class="h">Amigos</h2>
    ${nomeOk ? "" : `<div class="card hi">
      <div class="lbl">Como seus amigos vão te ver?</div>
      <input class="txt" id="nomeIn" maxlength="30" value="${esc(p.nome)}" autocomplete="nickname" aria-label="Seu nome">
      <button class="btn gold wide" id="nomeOk">Pronto</button>
    </div>`}
    <div class="me">
      <button class="avbtn" id="minhaFoto" aria-label="Foto do perfil">${avatarHTML(p.nome, "big", p.foto)}<span class="avcam">📷</span></button>
      <div class="meinfo">
        <b>${esc(p.nome)}</b> ${nomeOk ? `<button class="lnk" id="nomeEd" aria-label="Mudar nome">✏️</button>` : ""}
        <span class="muted small">Seu código: <b class="cod">${esc(amigos.codigoFmt(p.codigo))}</b></span>
      </div>
    </div>
    <div class="row2">
      <button class="btn gold" id="convidar">📲 Chamar amigo</button>
      <button class="btn" id="verQr">📷 Meu QR code</button>
    </div>
    <button class="btn ghost wide" id="temCod">🔑 Tenho o código de um amigo</button>

    ${caixa.length ? `<div class="lbl">Indicações pra você <b class="cnt">${caixa.length}</b></div>
      <ul class="inds">${caixa.map(indHTML).join("")}</ul>` : ""}

    <div class="lbl">Seus amigos ${lista && lista.length ? `<b class="cnt">${lista.length}</b>` : ""}</div>
    ${lista && lista.length ? `<ul class="amigos">${lista.map(a => `
      <li class="amg" data-amigo="${esc(a.user_id)}">
        ${avatarHTML(a.nome, "", a.foto)}
        <div class="rinfo"><div class="rtitle">${esc(a.nome)}</div><div class="rmeta">Amigos desde ${esc(quando(a.desde))}</div></div>
        <span class="chev">›</span>
      </li>`).join("")}</ul>`
      : `<div class="empty small">
        <div class="empty-emoji">🍿👥</div>
        <p>Chama a galera! Vocês veem a lista um do outro, descobrem o que os dois querem ver e mandam indicação direto pro app.</p>
      </div>`}
  `;
  const ni = $("#nomeOk"); if (ni) ni.onclick = async () => {
    const v = $("#nomeIn").value.trim();
    if (!v) { toast("Coloca um nome"); return; }
    try { if (v !== p.nome) await amigos.salvarNome(v); else amigos.confirmarNome(); toast("Beleza!"); }
    catch (e) { toast("Sem internet agora. Tenta de novo."); }
  };
  const ne = $("#nomeEd"); if (ne) ne.onclick = async () => {
    const v = (prompt("Seu nome pros amigos:", p.nome) || "").trim();
    if (!v || v === p.nome) return;
    try { await amigos.salvarNome(v); toast("Nome trocado"); } catch (e) { toast("Sem internet agora. Tenta de novo."); }
  };
  $("#convidar").onclick = convidar;
  $("#temCod").onclick = sheetCodigo;
  $("#verQr").onclick = sheetQr;
  $("#minhaFoto").onclick = sheetFoto;
  view.querySelectorAll(".amg").forEach(li => li.onclick = () => abrirAmigo(li.dataset.amigo));
  view.querySelectorAll(".ind").forEach(li => {
    const i = caixa.find(x => String(x.id) === li.dataset.ind);
    li.onclick = e => {
      const b = e.target.closest("[data-ia]");
      if (!b) { openDetails(store.get(i.key) || i.data); return; }
      e.stopPropagation();
      if (b.dataset.ia === "ok") aceitarInd(i);
      else { amigos.dispensar(i); toast("Indicação dispensada"); }
    };
  });
  amigos.lerCaixa();
}
function indHTML(i) {
  const m = i.data, meu = store.get(i.key);
  return `
    <li class="ind ${i.estado === "nova" ? "nova" : ""}" data-ind="${i.id}">
      ${posterHTML(m, "w185", "thumb")}
      <div class="rinfo">
        <div class="rtitle">${esc(m.title)}</div>
        <div class="rmeta">${typeLabel(m.type)}${m.year ? " · " + esc(m.year) : ""} · ${esc(quando(i.created_at))}</div>
        <div class="quem">${avatarHTML(i.nome, "mini", i.foto)} <b>${esc(i.nome)}</b>${i.msg ? `: “${esc(i.msg)}”` : " te indicou"}</div>
        ${verdictHTML(m)}
        <div class="iacts">
          ${meu ? `<span class="muted small">${meu.status === "seen" ? "✓ Você já viu" : "✓ Já tá na sua lista"}</span>
            <button class="btn ghost sm" data-ia="no">OK</button>`
          : `<button class="btn gold sm" data-ia="ok">＋ Quero ver</button><button class="btn ghost sm" data-ia="no">Dispensar</button>`}
        </div>
      </div>
    </li>`;
}
function aceitarInd(i) {
  const ok = store.get(i.key) ? true : store.add(i.data, "want");
  if (!ok) { toast("Não consegui salvar no aparelho."); return; }
  const it = store.get(i.key);
  if (it && !it.memo) store.setMemo(i.key, `Indicação de ${i.nome}${i.msg ? ": " + i.msg : ""}`.slice(0, 300));
  amigos.aceitar(i);
  toast(`${i.data.title} foi pro Quero ver 🍿`);
}
// Nos detalhes: quem te indicou este título.
function indicadoPorHTML(m) {
  const q = cloud.currentUser() ? amigos.quemIndicou(m.key) : [];
  if (!q.length) return "";
  return `<div class="indpor">${q.map(i => `<div>${avatarHTML(i.nome, "mini", i.foto)} <b>${esc(i.nome)}</b> te indicou${i.msg ? `: “${esc(i.msg)}”` : ""}</div>`).join("")}</div>`;
}

// ---------- convite ----------
async function convidar() {
  const p = amigos.getPerfil(); if (!p) return;
  const url = amigos.linkConvite();
  const txt = `🍿 Bora ser amigo na Cinemoteca! A gente vê a lista um do outro e manda indicação de filme e série.\nMeu código: ${amigos.codigoFmt(p.codigo)}`;
  if (navigator.share) { try { await navigator.share({ title: "Cinemoteca", text: txt, url }); } catch (e) { /* cancelou */ } return; }
  try { await navigator.clipboard.writeText(txt + "\n" + url); toast("Copiado! É só colar no WhatsApp"); }
  catch (e) { prompt("Copia e manda:", txt + " " + url); }
}
// QR code (a outra pessoa aponta a câmera e abre o convite).
let qrLib = null;
function carregaQr() {
  if (window.qrcode) return Promise.resolve();
  if (!qrLib) qrLib = new Promise((ok, falha) => {
    const sc = document.createElement("script");
    sc.src = "vendor/qrcode.js?v=22"; sc.onload = ok; sc.onerror = () => { qrLib = null; falha(); };
    document.head.appendChild(sc);
  });
  return qrLib;
}
async function sheetQr() {
  const p = amigos.getPerfil(); if (!p) return;
  openSheet(`<div class="dbody pad2 center">
    <h2 class="h">Meu QR code</h2>
    <p class="muted small">Seu amigo aponta a câmera do celular aqui e já cai no convite.</p>
    <div class="qr" id="qrBox"><span class="muted">Carregando…</span></div>
    <p class="muted small">Ou passa o código: <b class="cod">${esc(amigos.codigoFmt(p.codigo))}</b></p>
    <button class="btn ghost wide" id="trocaCod">🔄 Trocar meu código</button>
    <p class="tiny">Trocar faz os links e códigos antigos pararem de funcionar (bom se alguém repassou seu convite). Quem já é seu amigo continua.</p>
  </div>`);
  const tok = sheetToken;
  const desenha = () => {
    const box = $("#qrBox", sheet); if (!box || tok !== sheetToken) return;
    const q = window.qrcode(0, "M");
    q.addData(amigos.linkConvite()); q.make();
    box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  };
  try { await carregaQr(); desenha(); }
  catch (e) { const box = $("#qrBox", sheet); if (box) box.innerHTML = `<span class="muted">Sem internet pra montar o QR. Usa o código.</span>`; }
  $("#trocaCod", sheet).onclick = async () => {
    if (!confirm("Trocar seu código? Os links e códigos que vc já mandou param de funcionar.")) return;
    try {
      const c = await amigos.trocarCodigo();
      sheetQr();
      toast(`Código novo: ${amigos.codigoFmt(c)}`);
    } catch (e) { toast("Sem internet agora. Tenta de novo."); }
  };
}
// Foto do perfil: sem foto abre a galeria direto; com foto pergunta se troca ou tira.
function escolherFoto() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.hidden = true;
  document.body.appendChild(inp);
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
    if (!navigator.onLine) { toast("Sem internet agora. Tenta de novo."); return; }
    toast("Subindo a foto…");
    try { await amigos.trocarFoto(f); toast("📸 Foto nova!"); }
    catch (e) { toast(e.message === "imagem" ? "Não consegui abrir essa imagem." : "Não deu pra subir agora. Tenta de novo."); }
  };
  inp.click();
}
function sheetFoto() {
  const p = amigos.getPerfil(); if (!p) return;
  if (!p.foto) { escolherFoto(); return; }
  openSheet(`<div class="dbody pad2 center">
    ${avatarHTML(p.nome, "huge", p.foto)}
    <h2 class="h">Sua foto</h2>
    <p class="muted small">É assim que seus amigos te veem.</p>
    <button class="btn gold wide" id="fotoTroca">📷 Trocar foto</button>
    <button class="btn ghost wide" id="fotoTira">Tirar foto</button>
  </div>`);
  $("#fotoTroca", sheet).onclick = () => { closeSheet(); escolherFoto(); };
  $("#fotoTira", sheet).onclick = async () => {
    try { await amigos.removerFoto(); closeSheet(); toast("Foto removida"); }
    catch (e) { toast("Sem internet agora. Tenta de novo."); }
  };
}
amigos.onEntrou(novos => {
  const n = novos[0].nome;
  toast(novos.length > 1 ? `🎉 ${novos.length} amigos novos na Cinemoteca!` : `🎉 ${n} aceitou seu convite!`, "Ver", () =>
    novos.length > 1 ? go("amigos") : abrirAmigo(novos[0].user_id, n));
});
function sheetCodigo() {
  openSheet(`<div class="dbody pad2">
    <h2 class="h">Código do amigo</h2>
    <p class="muted small">Pede pro seu amigo abrir a aba Amigos e te passar o código dele.</p>
    <input class="txt cod" id="codIn" maxlength="8" placeholder="ABC-123" autocomplete="off" autocapitalize="characters" aria-label="Código do amigo">
    <button class="btn gold wide" id="codOk">Adicionar</button>
  </div>`);
  const inp = $("#codIn", sheet);
  setTimeout(() => inp.focus(), 250);
  const ir = () => { const c = inp.value.replace(/[^a-z0-9]/gi, "").toUpperCase(); if (c.length < 6) { toast("O código tem 6 letras/números"); return; } confirmarConvite(c); };
  $("#codOk", sheet).onclick = ir;
  inp.addEventListener("keydown", e => { if (e.key === "Enter") ir(); });
}
// Abriu pelo link de convite (?amigo=CODIGO).
function abrirConvite() {
  let cod = new URLSearchParams(location.search).get("amigo");
  try {
    if (cod) sessionStorage.setItem("cinemoteca_convite", cod);
    else cod = sessionStorage.getItem("cinemoteca_convite");
  } catch (e) { /* ignora */ }
  if (cod && location.search) history.replaceState(null, "", location.pathname);
  if (!cod || needLogin() || !cloud.currentUser()) return;
  try { sessionStorage.removeItem("cinemoteca_convite"); } catch (e) { /* ignora */ }
  confirmarConvite(cod);
}
async function confirmarConvite(cod) {
  let dono;
  try { dono = await amigos.verConvite(cod); }
  catch (e) { toast(navigator.onLine ? "Não consegui abrir o convite agora." : "Sem internet pra abrir o convite."); return; }
  if (!dono) { toast("Esse código não existe. Confere com seu amigo."); return; }
  const eu = cloud.currentUser();
  if (eu && dono.user_id === eu.id) { closeSheet(); toast("Esse é o seu próprio código 😅"); return; }
  if (dono.ja_amigos) { closeSheet(); toast(`Você e ${dono.nome} já são amigos`); return; }
  openSheet(`<div class="dbody pad2 center">
    ${avatarHTML(dono.nome, "huge", dono.foto)}
    <h2 class="h">${esc(dono.nome)}</h2>
    <p class="muted">te chamou pra ser amigo na Cinemoteca. Vocês vão ver a lista um do outro e poder mandar indicação.</p>
    <button class="btn gold wide" id="aceitaOk">🤝 Aceitar</button>
    <button class="btn ghost wide" id="aceitaNo">Agora não</button>
  </div>`);
  $("#aceitaNo", sheet).onclick = closeSheet;
  $("#aceitaOk", sheet).onclick = async () => {
    try {
      await amigos.aceitarConvite(cod);
      closeSheet();
      toast(`🎉 Agora você e ${dono.nome} são amigos!`);
      abrirAmigo(dono.user_id, dono.nome, dono.foto);
    } catch (e) { toast("Não deu certo agora. Tenta de novo."); }
  };
}

// ---------- perfil do amigo ----------
function afinidade(meus, dele, gm, gd) {
  const a = new Set((gm && gm.generos) || []), b = new Set((gd && gd.generos) || []);
  const uni = new Set([...a, ...b]).size;
  const jg = uni ? [...a].filter(x => b.has(x)).length / uni : 0;
  const keys = new Set(meus.map(i => i.key));
  const comum = dele.filter(i => keys.has(i.key)).length;
  const jt = Math.min(1, comum / 6);
  if (!uni && !comum) return null;
  return Math.round(35 + 65 * (0.6 * jg + 0.4 * jt));
}
async function abrirAmigo(id, nome, foto) {
  amigoAberto = { id, nome: nome || amigos.nomeDe(id), foto: foto || amigos.fotoDe(id), dados: null, indiquei: [], seg: null };
  if (tab !== "amigos") { tab = "amigos"; document.querySelectorAll("nav.bottom button").forEach(b => b.classList.toggle("on", b.dataset.tab === "amigos")); }
  renderAmigo(); window.scrollTo(0, 0);
  const alvo = amigoAberto;
  try {
    const [d, ind] = await Promise.all([amigos.listaDo(id), amigos.indiqueiPra(id).catch(() => [])]);
    if (amigoAberto !== alvo) return;
    d.items = (d.items || []).map(store.limpa).filter(i => i && i.key);
    alvo.dados = d; alvo.indiquei = (ind || []).map(x => ({ ...x, data: store.limpa(x.data) })); alvo.nome = d.nome || alvo.nome; if (d.foto !== undefined) alvo.foto = d.foto;
  } catch (e) {
    if (amigoAberto !== alvo) return;
    alvo.erro = true;
  }
  if (tab === "amigos" && amigoAberto === alvo) renderAmigo();
}
function renderAmigo() {
  const A = amigoAberto;
  const top = `<button class="back" id="voltar">‹ Amigos</button>`;
  if (!A.dados) {
    view.innerHTML = `${top}<div class="me">${avatarHTML(A.nome, "big", A.foto)}<div class="meinfo"><b>${esc(A.nome)}</b></div></div>
      <p class="muted center pad">${A.erro ? "📴 Não consegui abrir a lista agora. Precisa de internet." : "Carregando a lista…"}</p>`;
    $("#voltar").onclick = () => { amigoAberto = null; renderAmigos(); };
    return;
  }
  const meus = store.all();
  const meuKey = new Map(meus.map(i => [i.key, i]));
  const itens = A.dados.items || [];
  const quer = itens.filter(i => i.status === "want").sort(store.byQuality);
  const viu = itens.filter(i => i.status === "seen").sort((a, b) => (b.note || 0) - (a.note || 0) || (b.seenAt || 0) - (a.seenAt || 0));
  const comum = quer.filter(i => { const m = meuKey.get(i.key); return m && m.status === "want"; });
  const praMim = viu.filter(i => i.note >= 8 && !meuKey.has(i.key));
  const af = afinidade(meus, itens, gostos.get(), A.dados.gostos);
  const segs = [["comum", "Os dois", comum], ["quer", "Quer ver", quer], ["viu", "Já viu", viu], ["indiquei", "Você indicou", A.indiquei]];
  if (!A.seg) A.seg = comum.length ? "comum" : "quer";
  const src = (segs.find(s => s[0] === A.seg) || segs[1])[2];
  const g = A.dados.gostos;
  const primeiro = A.nome.split(" ")[0];

  view.innerHTML = `
    ${top}
    <div class="me">
      ${avatarHTML(A.nome, "big", A.foto)}
      <div class="meinfo">
        <b>${esc(A.nome)}</b>
        <span class="muted small">Quer ver ${quer.length} · Já viu ${viu.length}</span>
      </div>
      ${af != null ? `<div class="afin" title="Afinidade"><b>${af}%</b><span>afinidade</span></div>` : ""}
    </div>
    ${g && g.generos && g.generos.length ? `<div class="tags">${g.generos.map(id => `<span class="tag">${esc(gostos.label(id))}</span>`).join("")}</div>` : ""}
    ${comum.length ? `<button class="nowbar" id="sorteiaDois"><span>🎲 <b>Sortear um pros dois</b></span><span class="nowslot">${comum.length} em comum ›</span></button>` : ""}
    ${praMim.length ? `<div class="lbl">⭐ ${esc(primeiro)} amou e você não viu</div>
      <div class="strip">${praMim.slice(0, 12).map(m => `<button class="stc" data-k="${esc(m.key)}">${posterHTML(m, "w185", "sposter")}<span class="snote">★ ${m.note}</span></button>`).join("")}</div>` : ""}
    <div class="seg seg4" role="tablist">
      ${segs.map(([k, l, arr]) => `<button role="tab" class="${A.seg === k ? "on" : ""}" data-aseg="${k}">${l} <b>${arr.length}</b></button>`).join("")}
    </div>
    ${src.length ? `<ol class="queue">${src.map(it => amigoRowHTML(A.seg === "indiquei" ? { ...it.data, _estado: it.estado, _quando: it.created_at } : it, meuKey)).join("")}</ol>`
      : `<p class="muted center pad">${{ comum: `Nada que vocês dois querem ver ainda. Olha a lista de ${esc(primeiro)} e salva o que curtir!`, quer: "A lista tá vazia.", viu: "Ainda não marcou nada como visto.", indiquei: "Você ainda não indicou nada. Abre um filme e toca em “Indicar pra um amigo”." }[A.seg]}</p>`}
    <button class="btn ghost danger wide" id="desfaz">Desfazer amizade</button>
  `;
  $("#voltar").onclick = () => { amigoAberto = null; renderAmigos(); window.scrollTo(0, 0); };
  view.querySelectorAll("[data-aseg]").forEach(b => b.onclick = () => { A.seg = b.dataset.aseg; renderAmigo(); });
  const todos = new Map([...itens, ...A.indiquei.map(x => x.data)].map(i => [i.key, i]));
  const abre = key => openDetails(meuKey.get(key) || todos.get(key));
  view.querySelectorAll(".queue .row").forEach(r => r.onclick = () => abre(r.dataset.key));
  view.querySelectorAll(".stc").forEach(b => b.onclick = () => abre(b.dataset.k));
  const sd = $("#sorteiaDois"); if (sd) sd.onclick = () => {
    const m = comum[Math.floor(Math.random() * comum.length)];
    toast(`🎲 Deu ${m.title}!`);
    abre(m.key);
  };
  $("#desfaz").onclick = async () => {
    if (!confirm(`Desfazer amizade com ${A.nome}? Vocês param de ver a lista um do outro.`)) return;
    try { await amigos.desfazer(A.id); amigoAberto = null; renderAmigos(); toast("Amizade desfeita"); }
    catch (e) { toast("Sem internet agora. Tenta de novo."); }
  };
}
function amigoRowHTML(m, meuKey) {
  const meu = meuKey.get(m.key);
  const st = m._estado ? { nova: "📬 Enviada", vista: "👀 Viu a indicação", aceita: "✅ Salvou na lista", dispensada: "🙅 Dispensou" }[m._estado] : "";
  return `
    <li class="row" data-key="${esc(m.key)}">
      ${posterHTML(m, "w185", "thumb")}
      <div class="rinfo">
        <div class="rtitle">${esc(m.title)}</div>
        <div class="rmeta">${typeLabel(m.type)}${m.year ? " · " + esc(m.year) : ""}${m.status === "seen" && m.note ? ` · <span class="mine">★ ${m.note}/10</span>` : ""}</div>
        ${st ? `<div class="rmeta">${st} · ${esc(quando(m._quando))}</div>` : ""}
        ${verdictHTML(m)}
        ${meu && !m._estado ? `<div class="tuyo">${meu.status === "seen" ? "✓ Você já viu" : "🍿 Na sua lista"}</div>` : ""}
      </div>
    </li>`;
}

// ---------- indicar pra amigo ----------
function sheetIndicar(m) {
  const lista = amigos.getAmigos() || [];
  if (!lista.length) {
    openSheet(`<div class="dbody pad2 center">
      <div class="empty-emoji">👥</div>
      <h2 class="h">Sem amigos ainda</h2>
      <p class="muted">Chama alguém pra Cinemoteca e aí dá pra mandar indicação direto pro app da pessoa.</p>
      <button class="btn gold wide" id="conv">📲 Chamar amigo</button>
      <button class="btn ghost wide" id="link">🔗 Mandar só o link do filme</button>
    </div>`);
    $("#conv", sheet).onclick = () => { closeSheet(); go("amigos"); convidar(); };
    $("#link", sheet).onclick = () => indicar(m);
    return;
  }
  const sel = new Set(lista.length === 1 ? [lista[0].user_id] : []);
  openSheet(`<div class="dbody pad2">
    <div class="indhead">${posterHTML(m, "w185", "thumb")}<div><div class="lbl">Indicar</div><b>${esc(m.title)}</b></div></div>
    <div class="lbl">Pra quem?</div>
    <div class="pick">${lista.map(a => `<button class="pk ${sel.has(a.user_id) ? "on" : ""}" data-pk="${esc(a.user_id)}">${avatarHTML(a.nome, "", a.foto)}<span>${esc(a.nome.split(" ")[0])}</span></button>`).join("")}</div>
    <div class="lbl">Recado (opcional)</div>
    <textarea class="memo" id="recado" rows="2" maxlength="280" placeholder="Ex: assiste que é a sua cara kkk"></textarea>
    <button class="btn gold wide" id="manda">🍿 Mandar indicação</button>
    <button class="btn ghost wide" id="link">🔗 Mandar link pelo WhatsApp</button>
  </div>`);
  sheet.querySelectorAll("[data-pk]").forEach(b => b.onclick = () => {
    const id = b.dataset.pk; sel.has(id) ? sel.delete(id) : sel.add(id); b.classList.toggle("on", sel.has(id));
  });
  $("#link", sheet).onclick = () => indicar(m);
  $("#manda", sheet).onclick = async e => {
    if (!sel.size) { toast("Escolhe pelo menos um amigo"); return; }
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = "Mandando…";
    try {
      await amigos.indicar([...sel], m, $("#recado", sheet).value.trim());
      const nomes = lista.filter(a => sel.has(a.user_id)).map(a => a.nome.split(" ")[0]);
      openDetails(m);
      toast(`Indicação enviada pra ${nomes.length > 2 ? nomes.length + " amigos" : nomes.join(" e ")} 🍿`);
    } catch (err) {
      btn.disabled = false; btn.textContent = "🍿 Mandar indicação";
      toast(navigator.onLine ? "Não consegui mandar agora. Tenta de novo." : "Sem internet pra mandar agora.");
    }
  };
}

// ---------- SORTEIO ----------
$("#dice").onclick = () => sortear();

// Sorteia da aba atual (Quero ver ou Já vi) e do filtro (filmes/séries), sem repetir.
// Quando todos já saíram, avisa e recomeça do zero.
const SORTE_KEY = "cinemoteca_sorteados";
function sorteados() { try { return JSON.parse(localStorage.getItem(SORTE_KEY) || "{}"); } catch (e) { return {}; } }
function salvaSorteados(o) { try { localStorage.setItem(SORTE_KEY, JSON.stringify(o)); } catch (e) { /* ignora */ } }
function sortear() {
  const seg = listSeg, tipo = listType;
  const pool = store.all().filter(i => i.status === seg && (tipo === "all" || i.type === tipo));
  const nome = nomeTipo(tipo);
  const nomeSeg = seg === "want" ? "Quero ver" : "Já vi";
  if (!pool.length) { toast(`Não tem ${nome} em ${nomeSeg} pra sortear`); return; }
  const ch = seg + ":" + tipo;
  const reg = sorteados();
  let feitos = (reg[ch] || []).filter(k => pool.some(i => i.key === k));
  let resta = pool.filter(i => !feitos.includes(i.key));
  let recomecou = false;
  if (!resta.length) { feitos = []; resta = pool; recomecou = true; }
  const m = resta[Math.floor(Math.random() * resta.length)];
  feitos.push(m.key); reg[ch] = feitos; salvaSorteados(reg);
  const faltam = pool.length - feitos.length;
  openSheet(`
    <div class="nowhead"><div class="lbl">🎲 Sorteio · ${esc(nomeSeg)} · ${esc(nome)}</div><h2>Deu esse!</h2></div>
    <div class="dbody">
      ${recomecou && pool.length > 1 ? `<div class="notice" style="margin:0 0 12px">Já tinham saído todos os ${pool.length}. Comecei o sorteio do zero 🔄</div>` : ""}
      <div class="nowcard">
        ${posterHTML(m, "w342", "dposter")}
        <div class="htxt">
          <h2>${esc(m.title)}</h2>
          <div class="rmeta">${typeLabel(m.type)}${m.year ? " · " + esc(m.year) : ""}${m.note ? ` · <span class="mine">★ ${m.note}/10</span>` : ""}</div>
          ${verdictHTML(m)}
        </div>
      </div>
      ${m.memo ? `<p class="syn nowmemo">📝 ${esc(m.memo)}</p>` : ""}
      <div class="actions" style="margin-top:14px">
        <button class="btn gold" id="sOpen">Ver detalhes</button>
        <button class="btn" id="sNext">🎲 Sortear outro</button>
      </div>
      <p class="tiny center">${pool.length === 1 ? `Só tem esse em ${esc(nomeSeg)}` : faltam ? `Faltam ${faltam} de ${pool.length} sem repetir` : `Esse era o último dos ${pool.length}. O próximo recomeça do zero`}</p>
    </div>`);
  $("#sOpen", sheet).onclick = () => openDetails(m);
  $("#sNext", sheet).onclick = sortear;
}

// ---------- O QUE VER AGORA ----------
async function openNow() {
  // Respeita o filtro da aba (Filmes / Séries / Tudo).
  const tipo = listType;
  const nome = nomeTipo(tipo);
  const want = () => store.all().filter(i => i.status === "want" && (tipo === "all" || i.type === tipo));
  if (!want().length) { toast(`Não tem ${nome} em Quero ver 😉`); return; }
  const slot = now.slotFor();
  openSheet(`
    <div class="nowhead"><div class="lbl">O que ver agora · ${esc(nome)}</div><h2>${esc(slot.label)}</h2></div>
    <div class="dbody" id="nowBody"><p class="muted">Pensando…</p></div>`);
  const token = sheetToken;
  const alive = () => token === sheetToken && document.body.classList.contains("sheet-open");
  const body = () => $("#nowBody", sheet);

  // Primeira vez: descobre a duração e os gêneros de cada título da fila.
  const missing = want().filter(i => !i.metaAt);
  if (missing.length && tmdb.ready() && navigator.onLine) {
    let done = 0, next = 0;
    const show = () => { if (alive()) body().innerHTML = `<p class="muted">Vendo a duração dos seus títulos… <b>${done}</b> de <b>${missing.length}</b><br>Só demora assim na primeira vez.</p>`; };
    show();
    const worker = async () => {
      while (next < missing.length) {
        const m = missing[next++];
        try { store.setMeta(m.key, await tmdb.meta(m.type, m.id), false); } catch (e) { /* tenta de novo outro dia */ }
        done++; show();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    store.flush();
  }
  if (!alive()) return;
  const list = now.suggest(want(), slot, store.quality);
  let idx = 0;
  const render = () => {
    const m = list[idx % list.length];
    body().innerHTML = `
      <div class="nowcard">
        ${posterHTML(m, "w342", "dposter")}
        <div class="htxt">
          <h2>${esc(m.title)}</h2>
          <div class="rmeta">${typeLabel(m.type)}${m.year ? " · " + esc(m.year) : ""}</div>
          ${verdictHTML(m)}
          <p class="nowwhy">${esc(now.reason(m, slot))}</p>
        </div>
      </div>
      ${m.memo ? `<p class="syn nowmemo">📝 ${esc(m.memo)}</p>` : ""}
      <div class="actions" style="margin-top:14px">
        <button class="btn gold" id="nowOpen">Ver detalhes</button>
        <button class="btn" id="nowNext">🔄 Outra sugestão</button>
      </div>
      <p class="tiny center">${idx + 1} de ${list.length} que combinam com agora</p>`;
    $("#nowOpen", sheet).onclick = () => openDetails(m);
    $("#nowNext", sheet).onclick = () => { idx++; render(); };
  };
  render();
}

// ---------- AJUSTES ----------
function renderAjustes() {
  const n = store.all().length;
  const u = cloud.currentUser();
  view.innerHTML = `
    <h2 class="h">Ajustes</h2>

    ${u ? `<div class="card">
      <div class="lbl">Sua conta</div>
      <p class="acct">${esc(u.email)}</p>
      <p class="muted small" id="syncLine">${syncText()}</p>
      <div class="row2">
        <button class="btn" id="syncNow">🔄 Sincronizar agora</button>
        <button class="btn ghost" id="logout">Sair</button>
      </div>
    </div>` : ""}

    <div class="card">
      <div class="lbl">Seus gostos</div>
      ${(() => { const g = gostos.get(); return g && g.generos && g.generos.length
        ? `<div class="tags">${g.generos.map(id => `<span class="tag">${esc(gostos.label(id))}</span>`).join("")}</div>
           <p class="muted small">${g.tipo === "movie" ? "Só filmes" : g.tipo === "tv" ? "Só séries" : "Filmes e séries"}</p>`
        : `<p class="muted small">Ainda não escolheu. Com os gostos, a busca te indica filmes e séries do seu jeito.</p>`; })()}
      <button class="btn wide" id="editG">🍿 ${gostos.get() && gostos.get().generos && gostos.get().generos.length ? "Mudar meus gostos" : "Escolher meus gostos"}</button>
    </div>


    <div class="card">
      <div class="lbl">Sua lista (${n} ${n === 1 ? "título" : "títulos"})</div>
      <p class="muted small">${u ? "Fica salva na sua conta e também neste aparelho (abre sem internet). O backup é opcional, pra ter um arquivo seu." : "Fica salva só neste celular. Faça um backup de vez em quando pra não perder se trocar de aparelho."}</p>
      <div class="row2">
        <button class="btn" id="exp">⬇️ Fazer backup</button>
        <label class="btn" for="imp">⬆️ Restaurar</label>
        <input id="imp" type="file" accept="application/json,.json" hidden>
      </div>
      ${n ? `<button class="btn ghost danger wide" id="wipe">Apagar a lista toda</button>` : ""}
    </div>

    <div class="card">
      <div class="lbl">Como usar</div>
      <button class="btn wide" id="verTuto">👀 Ver o tutorial de novo</button>
    </div>

    <div class="card">
      <div class="lbl">Instalar como app</div>
      <p class="muted small">No iPhone: botão Compartilhar do Safari → "Adicionar à Tela de Início". No Android: menu ⋮ do Chrome → "Instalar app".</p>
    </div>

    <p class="tiny center">Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.<br>Dados de onde assistir fornecidos pela JustWatch.</p>
  `;
  $("#editG").onclick = editarGostos;
  $("#verTuto").onclick = () => mostrarTutorial(true);
  const sn = $("#syncNow"); if (sn) sn.onclick = () => { cloud.sync(); toast("Sincronizando…"); };
  const lo = $("#logout"); if (lo) lo.onclick = async () => {
    const pend = store.pendingCount();
    if (!confirm(pend && !navigator.onLine
      ? `Tem ${pend} alteração(ões) que ainda não subiram (sem internet). Elas ficam guardadas neste aparelho e sobem quando você entrar de novo. Sair mesmo?`
      : "Sair da sua conta neste aparelho? Sua lista continua salva na nuvem.")) return;
    await cloud.signOut();
  };
  $("#exp").onclick = () => {
    const blob = new Blob([store.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cinemoteca-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("#imp").onchange = async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch (err) { toast("Esse arquivo não é da Cinemoteca."); return; }
    if (data && Array.isArray(data.titles)) { importTitles(data.titles); return; }
    try { const k = store.importJSON(JSON.stringify(data)); toast(k ? `${k} títulos voltaram pra lista` : "Nada novo: tudo do backup já tá na lista"); renderAjustes(); }
    catch (err) { toast("Esse arquivo não é um backup da Cinemoteca."); }
  };
  const w = $("#wipe"); if (w) w.onclick = () => {
    if (confirm(u ? "Apagar toda a sua lista (na conta e em todos os aparelhos)? Isso não tem volta." : "Apagar toda a sua lista deste aparelho? Isso não tem volta.")) { store.clearAll(); toast("Lista apagada"); renderAjustes(); }
  };
}

function syncText() {
  const s = cloud.syncStatus();
  if (!s.online || s.status === "offline") return s.pending ? `📴 Sem internet. ${s.pending} alteração(ões) sobem quando voltar.` : "📴 Sem internet. Mostrando a lista guardada no aparelho.";
  if (s.status === "syncing") return "🔄 Sincronizando…";
  if (s.status === "error") return `⚠️ Não consegui falar com a nuvem agora.${s.pending ? ` ${s.pending} alteração(ões) esperando.` : ""} Tenta de novo daqui a pouco.`;
  if (s.pending) return `⏳ ${s.pending} alteração(ões) esperando pra subir.`;
  return "☁️ Tudo salvo na nuvem.";
}

// ---------- IMPORTAR LISTA DE TÍTULOS ----------
// Arquivo com { titles: [{ title, original?, q?, year?, type?, status?, memo? }] }.
// O app acha cada um no TMDB (capa, trailer, onde assistir) e guarda na lista.
let importing = false;
async function importTitles(titles) {
  if (importing) return;
  if (!tmdb.ready()) { toast("Entra na sua conta primeiro."); return; }
  importing = true;
  go("ajustes");
  const box = document.createElement("div");
  box.className = "notice";
  view.prepend(box);
  const list = titles.filter(t => t && (t.title || t.q)).slice(0, 1000);
  const missed = [], loose = [];
  let done = 0, added = 0, dup = 0;
  const show = () => { box.innerHTML = `⏳ Trazendo sua lista… <b>${done}</b> de <b>${list.length}</b><br><span class="muted">Deixa a tela aberta, leva uns segundos.</span>`; };
  show();
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const k = next++, t = list[k];
      try {
        const ask = () => tmdb.findBest({ q: t.q, original: t.original, title: t.title, year: +t.year || null, type: t.type === "tv" ? "tv" : t.type === "movie" ? "movie" : null });
        let r;
        try { r = await ask(); }
        catch (e1) {
          if (e1.kind !== "rate" && e1.kind !== "network" && e1.kind !== "http") throw e1;
          await new Promise(res => setTimeout(res, 1500));
          r = await ask();
        }
        if (!r) missed.push(t.title || t.q);
        else {
          if (r.loose) loose.push(`${t.title} → ${r.media.title}${r.media.year ? " (" + r.media.year + ")" : ""}`);
          const status = t.status === "seen" ? "seen" : "want";
          if (store.addImported(r.media, { status, memo: t.memo, note: +t.note || 0 })) added++; else dup++;
          if ((added + dup) % 10 === 0) store.flush();
        }
      } catch (e) {
        if (e.kind === "server_key" || e.kind === "login") { missed.push(t.title); next = list.length; toast(errorText(e)); }
        else missed.push(t.title || t.q);
      }
      done++; show();
    }
  }
  if (typeof store.addImported !== "function" || typeof tmdb.findBest !== "function") {
    importing = false;
    box.innerHTML = "⚠️ O app está numa versão antiga guardada no celular. Fecha a aba, abre de novo e tenta outra vez.";
    return;
  }
  try { await Promise.all([worker(), worker(), worker(), worker()]); }
  finally { store.flush(); importing = false; }
  renderAjustes();
  const res = document.createElement("div");
  res.className = "notice";
  res.innerHTML = `✅ <b>${added}</b> títulos entraram na sua lista${dup ? ` (${dup} já estavam lá)` : ""}.
    ${loose.length ? `<div class="lbl">Confere se acertei</div><p class="muted small">${loose.map(esc).join("<br>")}</p>` : ""}
    ${missed.length ? `<div class="lbl">Não achei (busca manual)</div><p class="muted small">${missed.map(esc).join("<br>")}</p>` : ""}
    <button class="btn gold wide" id="seeList">🎬 Ver minha lista</button>`;
  view.prepend(res);
  $("#seeList").onclick = () => go("lista");
}

// ---------- início ----------
cloud.start();
gostos.carregar();
if (!needLogin() && !store.all().length && tmdb.ready()) go("buscar"); else render();
abrirIndicado();
amigos.start();
if (cloud.currentUser()) { amigos.carregar(); abrirConvite(); }
setTimeout(() => { if (!document.body.classList.contains("sheet-open")) mostrarTutorial(); }, 1500);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
