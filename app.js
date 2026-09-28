import * as tmdb from "./tmdb.js";
import * as store from "./store.js";

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

function render() {
  if (tab === "lista") renderLista();
  else if (tab === "buscar") renderBuscar();
  else renderAjustes();
}
store.onChange(() => { if (tab === "lista") renderLista(); });

// ---------- MINHA LISTA ----------
let listSeg = "want";
let listType = "all";
function renderLista() {
  const items = store.all();
  const want = items.filter(i => i.status === "want").sort(store.byOrder);
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
    <div class="seg" role="tablist">
      <button role="tab" class="${listSeg === "want" ? "on" : ""}" data-seg="want">Quero ver <b>${want.length}</b></button>
      <button role="tab" class="${listSeg === "seen" ? "on" : ""}" data-seg="seen">Já vi <b>${seen.length}</b></button>
    </div>
    <div class="chips">
      ${[["all", "Tudo"], ["movie", "Filmes"], ["tv", "Séries"]].map(([k, l]) => `<button class="chip ${listType === k ? "on" : ""}" data-type="${k}">${l}</button>`).join("")}
    </div>
    ${src.length ? `<ol class="queue">${src.map((m, k) => rowHTML(m, k, src.length)).join("")}</ol>`
      : `<p class="muted center pad">${listSeg === "want" ? "Nada aqui nesse filtro." : "Quando marcar algo como visto, aparece aqui."}</p>`}
  `;
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
  const canMove = !seen && listType === "all";
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
  if (!tmdb.getKey()) {
    box.innerHTML = `<div class="notice">Pra buscar, falta colocar a chave do TMDB. <button class="link" id="goCfg">Ir pra Ajustes</button></div>`;
    $("#goCfg").onclick = () => go("ajustes");
    return;
  }
  box.innerHTML = `<p class="muted center pad">${query ? "Procurando…" : "Carregando os mais falados da semana…"}</p>`;
  try {
    const list = query ? await tmdb.search(query, { signal: ctl.signal }) : await tmdb.trending({ signal: ctl.signal });
    if (ctl !== searchCtl) return;
    if (!list.length) { box.innerHTML = `<p class="muted center pad">Não achei nada com "${esc(query)}". Tenta o nome em inglês, só uma parte do nome ou o nome de um ator.</p>`; return; }
    box.innerHTML = `${query ? "" : `<h3 class="sec">🔥 Em alta essa semana</h3>`}
      <ul class="results">${list.map(resultHTML).join("")}</ul>`;
    box.querySelectorAll(".res").forEach(el => {
      const m = list.find(x => x.key === el.dataset.key);
      el.onclick = e => {
        if (e.target.closest(".quick")) { e.stopPropagation(); quickAdd(m, el); return; }
        openDetails(m);
      };
    });
  } catch (e) {
    if (e.name === "AbortError") return;
    if (ctl !== searchCtl) return;
    box.innerHTML = `<div class="notice">${esc(errorText(e))}${e.kind === "no_key" || e.kind === "bad_key" ? ` <button class="link" id="goCfg">Ir pra Ajustes</button>` : ""}</div>`;
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
function openSheet(html) {
  sheet.innerHTML = `<div class="grab"></div><button class="close" aria-label="Fechar">×</button>${html}`;
  sheet.scrollTop = 0;
  document.body.classList.add("sheet-open");
  $(".close", sheet).onclick = closeSheet;
}
function closeSheet() {
  if (detailsCtl) { detailsCtl.abort(); detailsCtl = null; }
  document.body.classList.remove("sheet-open");
}
sheetBg.onclick = closeSheet;
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

async function openDetails(m) {
  openSheet(detailsHTML(m, null));
  wireDetails(m);
  if (!tmdb.getKey()) return;
  if (detailsCtl) detailsCtl.abort();
  const ctl = new AbortController(); detailsCtl = ctl;
  try {
    const d = await tmdb.details(m.type, m.id, { signal: ctl.signal });
    if (ctl !== detailsCtl || !document.body.classList.contains("sheet-open")) return;
    const top = sheet.scrollTop;
    sheet.innerHTML = `<div class="grab"></div><button class="close" aria-label="Fechar">×</button>${detailsHTML(d, d)}`;
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
function wireDetails(m) {
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
  sheet.innerHTML = `<div class="grab"></div><button class="close" aria-label="Fechar">×</button>${detailsHTML(m, d)}`;
  $(".close", sheet).onclick = closeSheet;
  sheet.scrollTop = top;
  wireDetails(m);
}

// ---------- SORTEIO ----------
$("#dice").onclick = () => {
  const want = store.all().filter(i => i.status === "want");
  if (!want.length) { toast("Adiciona uns títulos em Quero ver primeiro 😉"); return; }
  const pick = want[Math.floor(Math.random() * want.length)];
  toast("🎲 Hoje é dia de…");
  openDetails(pick);
};

// ---------- AJUSTES ----------
function renderAjustes() {
  const n = store.all().length;
  const local = tmdb.hasLocalKey();
  view.innerHTML = `
    <h2 class="h">Ajustes</h2>

    <div class="card">
      <div class="lbl">Chave do TMDB</div>
      <p class="muted small">É o que faz a busca funcionar. Ela fica salva só neste aparelho.</p>
      <input id="key" type="password" autocomplete="off" placeholder="${local ? "•••• chave salva" : "Cole aqui a chave ou o token"}">
      <div class="row2">
        <button class="btn gold" id="saveKey">Salvar chave</button>
        ${local ? `<button class="btn ghost" id="delKey">Apagar</button>` : ""}
      </div>
      <p class="tiny">Como pegar: crie uma conta grátis em themoviedb.org → Configurações → API → peça uma chave de uso pessoal.</p>
    </div>

    <div class="card">
      <div class="lbl">Sua lista (${n} ${n === 1 ? "título" : "títulos"})</div>
      <p class="muted small">Fica salva só neste celular. Faça um backup de vez em quando pra não perder se trocar de aparelho.</p>
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
  $("#saveKey").onclick = () => {
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
    try { const k = store.importJSON(await f.text()); toast(`${k} títulos restaurados`); renderAjustes(); }
    catch (err) { toast("Esse arquivo não é um backup da Cinemoteca."); }
  };
  const w = $("#wipe"); if (w) w.onclick = () => {
    if (confirm("Apagar toda a sua lista deste aparelho? Isso não tem volta.")) { store.clearAll(); toast("Lista apagada"); renderAjustes(); }
  };
}

// ---------- início ----------
if (!store.all().length && tmdb.getKey()) go("buscar"); else render();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
