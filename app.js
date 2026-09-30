import * as tmdb from "./tmdb.js?v=14";
import * as store from "./store.js?v=14";
import * as now from "./now.js?v=14";
import * as cloud from "./cloud.js?v=14";
import * as gostos from "./gostos.js?v=14";

const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const sheet = $("#sheet");
const sheetBg = $("#sheetBg");

// ---------- utilidades ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const typeLabel = t => (t === "tv" ? "Série" : "Filme");

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

function posterHTML(m, size = "w342", cls = "poster") {
  const src = tmdb.img(m.poster, size);
  if (src) return `<img class="${cls}" src="${src}" alt="Capa de ${esc(m.title)}" data-title="${esc(m.title)}" loading="lazy" onerror="imgFail(this)">`;
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
  if (e.kind === "no_key") return "Falta configurar a chave do TMDB em Ajustes.";
  if (e.kind === "bad_key") return "A chave do TMDB não funcionou. Confere em Ajustes.";
  if (e.kind === "network") return "Sem internet agora.";
  if (e.kind === "rate") return "Muitas buscas seguidas. Espera uns segundos.";
  return "Deu um problema na busca. Tenta de novo.";
}

// ---------- navegação ----------
let tab = "lista";
function go(name) {
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
});

// Entrou/saiu da conta: redesenha tudo. Só mudou o status da nuvem: atualiza Ajustes.
let wasLogged = !!cloud.currentUser();
cloud.onChange(() => {
  const logged = !!cloud.currentUser();
  if (logged !== wasLogged) {
    wasLogged = logged; closeSheet(); tab = "lista"; gostos.reset(); go("lista");
    if (logged) { gostos.carregar(); setTimeout(abrirIndicado, 300); }
    return;
  }
  if (!needLogin() && tab === "ajustes") { const el = $("#syncLine"); if (el) el.innerHTML = syncText(); }
});
window.addEventListener("cinemoteca:migrou", e => {
  const { total, pending } = e.detail || {};
  toast(pending ? `Sua lista (${total}) vai subir pra nuvem quando tiver internet` : `✅ Sua lista (${total}) subiu pra nuvem`);
});

// ---------- GOSTOS (questionário estilo Spotify) ----------
gostos.onChange(() => { if (naPergunta() && !$(".gostos")) render(); });
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
  };
  $("#gSkip").onclick = () => {
    const eraEdicao = editandoGostos;
    editandoGostos = false; escolha = null;
    if (!eraEdicao) gostos.salvar([], "ambos", true);
    document.body.classList.remove("auth");
    go(eraEdicao ? "ajustes" : "lista");
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
  view.querySelectorAll(".row").forEach(r => r.onclick = e => {
    const mv = e.target.closest("[data-move]");
    if (mv) { e.stopPropagation(); store.move(r.dataset.key, +mv.dataset.move); return; }
    const it = store.get(r.dataset.key);
    if (it) openDetails(it);
  });
}
function rowHTML(m, k, n) {
  const seen = m.status === "seen";
  const canMove = false; // a fila é pela qualidade, não pela ordem de adição
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
      ${canMove ? `<div class="mv">
        <button data-move="-1" aria-label="Subir na fila" ${k === 0 ? "disabled" : ""}>▲</button>
        <button data-move="1" aria-label="Descer na fila" ${k === n - 1 ? "disabled" : ""}>▼</button>
      </div>` : ""}
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
    box.innerHTML = `<div class="notice">Pra buscar, falta colocar a chave do TMDB. <button class="link" id="goCfg">Ir pra Ajustes</button></div>`;
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
      el.onclick = e => {
        if (e.target.closest(".quick")) { e.stopPropagation(); quickAdd(m, el); return; }
        openDetails(m);
      };
    });
  } catch (e) {
    if (e.name === "AbortError") return;
    if (ctl !== searchCtl) return;
    box.innerHTML = `<div class="notice">${esc(errorText(e))}${["no_key", "bad_key", "login"].includes(e.kind) ? ` <button class="link" id="goCfg">Ir pra Ajustes</button>` : ""}</div>`;
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
function openSheet(html) {
  sheetToken++;
  sheet.innerHTML = `<div class="grab"></div><div class="closebar"><button class="close" aria-label="Fechar">×</button></div>${html}`;
  sheet.scrollTop = 0;
  document.body.classList.add("sheet-open");
  $(".close", sheet).onclick = closeSheet;
}
function closeSheet() {
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
    sheet.innerHTML = `<div class="grab"></div><div class="closebar"><button class="close" aria-label="Fechar">×</button></div>${detailsHTML(d, d)}`;
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
    <div class="hero" ${bd ? `style="background-image:linear-gradient(180deg,rgba(10,10,15,.1),#14141d 92%),url('${bd}')"` : ""}>
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
      <div class="actions">${actions}</div>
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
      <div class="plogos">${arr.map(x => `<img src="${tmdb.img(x.logo, "w92")}" alt="${esc(x.name)}" title="${esc(x.name)}">`).join("")}</div>
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
    b.className = "close share"; b.setAttribute("aria-label", "Indicar pra alguém"); b.textContent = "📤";
    b.onclick = () => indicar(m);
    cb.appendChild(b);
  }
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
  sheet.innerHTML = `<div class="grab"></div><div class="closebar"><button class="close" aria-label="Fechar">×</button></div>${detailsHTML(m, d)}`;
  $(".close", sheet).onclick = closeSheet;
  sheet.scrollTop = top;
  wireDetails(m);
}

// ---------- SORTEIO ----------
$("#dice").onclick = () => openNow();

// ---------- O QUE VER AGORA ----------
async function openNow() {
  const want = () => store.all().filter(i => i.status === "want");
  if (!want().length) { toast("Adiciona uns títulos em Quero ver primeiro 😉"); return; }
  const slot = now.slotFor();
  openSheet(`
    <div class="nowhead"><div class="lbl">O que ver agora</div><h2>${esc(slot.label)}</h2></div>
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
  const local = tmdb.hasLocalKey();
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

    ${cloud.enabled ? "" : `<div class="card">
      <div class="lbl">Chave do TMDB</div>
      <p class="muted small">É o que faz a busca funcionar. Ela fica salva só neste aparelho.</p>
      <input id="key" type="password" autocomplete="off" placeholder="${local ? "•••• chave salva" : "Cole aqui a chave ou o token"}">
      <div class="row2">
        <button class="btn gold" id="saveKey">Salvar chave</button>
        ${local ? `<button class="btn ghost" id="delKey">Apagar</button>` : ""}
      </div>
      <p class="tiny">Como pegar: crie uma conta grátis em themoviedb.org → Configurações → API → peça uma chave de uso pessoal.</p>
    </div>`}

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
      <div class="lbl">Instalar como app</div>
      <p class="muted small">No iPhone: botão Compartilhar do Safari → "Adicionar à Tela de Início". No Android: menu ⋮ do Chrome → "Instalar app".</p>
    </div>

    <p class="tiny center">Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.<br>Dados de onde assistir fornecidos pela JustWatch.</p>
  `;
  $("#editG").onclick = editarGostos;
  const sn = $("#syncNow"); if (sn) sn.onclick = () => { cloud.sync(); toast("Sincronizando…"); };
  const lo = $("#logout"); if (lo) lo.onclick = async () => {
    const pend = store.pendingCount();
    if (!confirm(pend && !navigator.onLine
      ? `Tem ${pend} alteração(ões) que ainda não subiram (sem internet). Elas ficam guardadas neste aparelho e sobem quando você entrar de novo. Sair mesmo?`
      : "Sair da sua conta neste aparelho? Sua lista continua salva na nuvem.")) return;
    await cloud.signOut();
  };
  const sk = $("#saveKey"); if (sk) sk.onclick = () => {
    const v = $("#key").value.trim();
    if (!v) { toast("Cola a chave primeiro."); return; }
    tmdb.setLocalKey(v); toast("Chave salva! Testa na busca."); renderAjustes();
  };
  const dk = $("#delKey"); if (dk) dk.onclick = () => { tmdb.setLocalKey(""); toast("Chave apagada"); renderAjustes(); };
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
    try { const k = store.importJSON(JSON.stringify(data)); toast(`${k} títulos restaurados`); renderAjustes(); }
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
  if (!tmdb.ready()) { toast(cloud.enabled ? "Entra na sua conta primeiro." : "Salva a chave do TMDB primeiro."); return; }
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
          if (store.addImported(r.media, { status, memo: t.memo, order: k, note: +t.note || 0 })) added++; else dup++;
          if ((added + dup) % 10 === 0) store.flush();
        }
      } catch (e) {
        if (e.kind === "bad_key" || e.kind === "no_key") { missed.push(t.title); next = list.length; toast(errorText(e)); }
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

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
