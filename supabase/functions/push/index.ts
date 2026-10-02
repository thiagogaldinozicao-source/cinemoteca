// Função "push" da Cinemoteca: manda o aviso pro celular (notificação).
// Quem chama é o próprio banco (gatilho em mensagens/indicacoes e o agendamento
// da sugestão do dia), com o cabeçalho x-segredo. Ninguém de fora consegue usar.
// As chaves VAPID e o segredo ficam no Vault (função push_config, só o servidor lê).
//
// Corpo: { tipo: "msg", id } | { tipo: "ind", id } | { tipo: "sug" } | { tipo: "teste", user }
import webpush from "npm:web-push@3.6.7";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const APP = "https://thiagogaldinozicao-source.github.io/cinemoteca/";

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`db ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const rpc = (fn: string, body: unknown = {}) => db(`rpc/${fn}`, { method: "POST", body: JSON.stringify(body) });

let cfg: Record<string, string> | null = null;
async function config() {
  if (!cfg) {
    cfg = await rpc("push_config");
    webpush.setVapidDetails("mailto:thiagogaldinozicao@gmail.com", cfg!.vapid_publico, cfg!.vapid_privado);
  }
  return cfg!;
}

type Sub = { endpoint: string; sub: webpush.PushSubscription; avisos: Record<string, boolean> };
const nomeDe = async (id: string) => ((await db(`perfis?select=nome&user_id=eq.${id}`))[0] || {}).nome || "Amigo";
const primeiro = (n: string) => String(n).split(" ")[0];
const cortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// Número no ícone do app: mensagens não lidas + indicações novas.
async function pendentes(user: string) {
  const [m, i] = await Promise.all([
    fetch(`${URL_}/rest/v1/mensagens?select=id&para=eq.${user}&lida=is.false`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } }),
    fetch(`${URL_}/rest/v1/indicacoes?select=id&para=eq.${user}&estado=eq.nova`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } }),
  ]);
  const n = (r: Response) => +((r.headers.get("content-range") || "/0").split("/")[1] || 0);
  return n(m) + n(i);
}

async function mandar(user: string, tipo: string, payload: Record<string, unknown>) {
  const subs: Sub[] = await db(`push_subs?select=endpoint,sub,avisos&user_id=eq.${user}&ativo=is.true`);
  const alvo = subs.filter(s => tipo === "teste" || s.avisos?.[tipo] !== false);
  if (!alvo.length) return 0;
  const corpo = JSON.stringify({ ...payload, badge: await pendentes(user) });
  let ok = 0;
  await Promise.all(alvo.map(async s => {
    try {
      await webpush.sendNotification(s.sub, corpo, { TTL: tipo === "sug" ? 3600 * 6 : 3600 * 24, urgency: tipo === "sug" ? "low" : "high" });
      ok++;
    } catch (e) {
      const st = (e as { statusCode?: number }).statusCode;
      // aparelho desinstalou ou desligou os avisos: apaga
      if (st === 404 || st === 410) await db(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
      else console.error("push falhou", st, String(e));
    }
  }));
  return ok;
}

async function msg(id: number) {
  const [m] = await db(`mensagens?select=de,para,texto,item&id=eq.${id}`);
  if (!m) return 0;
  const nome = primeiro(await nomeDe(m.de));
  const body = m.item ? `🎬 ${m.item.title || "Te mandou um filme"}${m.texto ? " · " + m.texto : ""}` : m.texto;
  return mandar(m.para, "chat", {
    title: `💬 ${nome}`, body: cortar(body, 180), tag: `chat-${m.de}`,
    url: `${APP}?chat=${m.de}`,
  });
}

async function ind(id: number) {
  const [x] = await db(`indicacoes?select=de,para,data,msg&id=eq.${id}`);
  if (!x) return 0;
  const nome = primeiro(await nomeDe(x.de));
  const t = x.data?.title || "um título";
  return mandar(x.para, "ind", {
    title: `🍿 ${nome} te indicou ${cortar(t, 60)}`,
    body: x.msg ? `“${cortar(x.msg, 140)}”` : "Toca pra ver se vale a pena",
    tag: `ind-${id}`, url: `${APP}?t=${encodeURIComponent(x.data?.key || "")}`,
    img: x.data?.poster ? `https://image.tmdb.org/t/p/w342${x.data.poster}` : undefined,
  });
}

// ---------- sugestão esperta ----------
// Roda de hora em hora. Pra cada pessoa decide se AGORA é um bom momento:
// o horário em que ela costuma abrir o app, o dia da semana e feriado.
// Regras: nunca entre 23h e 9h, no máximo 1 por dia e 4 por semana, e nada se
// a pessoa já abriu o app hoje (não precisa ser chamada).
const FERIADOS = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25",
  "2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2027-02-08", "2027-02-09", "2027-03-26", "2027-05-27",
  "2028-02-28", "2028-02-29", "2028-04-14", "2028-06-15"]);
const LEVES = new Set([35, 16, 10751, 10402, 12]); // comédia, animação, família, música, aventura
const q = (d: any) => ((+d.vote || 0) * (+d.votes || 0) + 6.5 * 200) / ((+d.votes || 0) + 200);
const sorteia = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const capa = (d: any) => (d.poster ? `https://image.tmdb.org/t/p/w342${d.poster}` : undefined);
const veredito = (d: any) => ((+d.votes || 0) < 50 ? "" : +d.vote >= 7.8 ? " ⭐ Vale muito." : +d.vote >= 6.8 ? " 👍 Vale a pena." : "");

function agoraBR() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  const data = `${p.year}-${p.month}-${p.day}`;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { data, hora: +p.hour % 24, dow, feriado: FERIADOS.has(data) || FERIADOS.has(data.slice(5)) };
}
// Hora favorita da noite (17h–22h) pelo histórico de quando abre o app; sem histórico, 20h.
function favorita(horas: number[]) {
  let best = 20, max = 0, tot = 0;
  for (let h = 17; h <= 22; h++) { tot += horas[h] || 0; if ((horas[h] || 0) > max) { max = horas[h]; best = h; } }
  return tot >= 3 ? best : 20;
}
// Que tipo de momento é agora pra essa pessoa (ou null = não é hora).
function momento(t: ReturnType<typeof agoraBR>, fav: number) {
  if (t.hora < 9 || t.hora >= 23) return null;
  if (t.feriado) return t.hora === 15 ? "tarde-livre" : t.hora === fav ? "noite-livre" : null;
  if (t.dow === 6) return t.hora === 15 ? "tarde-livre" : t.hora === fav ? "sabado" : null;
  if (t.dow === 0) return t.hora === 16 ? "domingo" : t.hora === Math.max(18, fav - 1) ? "domingo-noite" : null;
  if (t.dow === 5) return t.hora === Math.max(18, fav - 1) ? "sexta" : null;
  return t.hora === fav ? "semana" : null;
}

function emAndamento(d: any) {
  if (d.type !== "tv" || !d.prog) return false;
  const t = d.temps || [];
  return !(t.length && d.prog.s >= t.length && d.prog.e >= (t[d.prog.s - 1] || 0));
}
function proxEp(d: any) {
  const t = d.temps || [], p = d.prog;
  if (t[p.s - 1] && p.e >= t[p.s - 1]) return `T${p.s + 1} E1`;
  return `T${p.s} E${p.e + 1}`;
}

async function sessaoADois(u: string, want: any[]) {
  const am: { a: string; b: string }[] = await db(`amizades?select=a,b&or=(a.eq.${u},b.eq.${u})`);
  if (!am.length) return null;
  const meus = new Map(want.map(d => [d.key, d]));
  for (const f of am.map(x => (x.a === u ? x.b : x.a)).sort(() => Math.random() - 0.5)) {
    const deles: { key: string }[] = await db(`items?select=key&user_id=eq.${f}&deleted=is.false&data->>status=eq.want&limit=400`);
    const comuns = deles.map(x => meus.get(x.key)).filter(Boolean).sort((a, b) => q(b) - q(a)).slice(0, 5);
    if (comuns.length) return { amigo: primeiro(await nomeDe(f)), d: sorteia(comuns) };
  }
  return null;
}

// Monta o aviso certo pro momento. Devolve null se não tem nada que combine.
async function montar(u: string, mom: string, want: any[]) {
  const top = (l: any[]) => sorteia(l.sort((a, b) => q(b) - q(a)).slice(0, 6));
  const titulo = (d: any) => cortar(d.title || "aquele filme", 48);
  const link = (d: any) => `${APP}?t=${encodeURIComponent(d.key)}`;
  const series = want.filter(emAndamento).sort((a, b) => (b.prog.at || 0) - (a.prog.at || 0));
  const filmes = want.filter(d => d.type === "movie");
  const fds = ["sexta", "sabado", "domingo", "tarde-livre", "noite-livre", "domingo-noite"].includes(mom);

  if (fds && Math.random() < 0.35) {
    const s = await sessaoADois(u, want);
    if (s) return { title: `👥 Vc e ${s.amigo} querem ver ${titulo(s.d)}`, body: "Que tal uma sessão a dois hoje? 🍿", url: link(s.d), img: capa(s.d), key: s.d.key };
  }
  if ((mom === "semana" || mom === "domingo-noite") && series.length) {
    const d = series[0];
    const min = d.epRuntime ? ` São só ${d.epRuntime} min.` : "";
    return { title: `▶ Bora o ${proxEp(d)} de ${titulo(d)}?`, body: `Vc parou no ${d.prog.e ? "E" + d.prog.e : "comecinho"}.${min}`, url: link(d), img: capa(d), key: d.key };
  }
  if (mom === "sexta" || mom === "sabado" || mom === "noite-livre") {
    const grandes = filmes.filter(d => !d.runtime || d.runtime >= 95);
    const d = top(grandes.length ? grandes : (filmes.length ? filmes : want));
    const [t, b] = mom === "sexta" ? [`🍿 Sextou! Hora de ${titulo(d)}`, "Filmão pra fechar a semana."]
      : mom === "sabado" ? [`🎬 Sábado à noite pede ${titulo(d)}`, "Já tá na sua lista, só dar o play."]
      : [`🎉 Feriado combina com ${titulo(d)}`, "Aproveita a folga."];
    return { title: t, body: b + veredito(d), url: link(d), img: capa(d), key: d.key };
  }
  if (mom === "domingo" || mom === "tarde-livre") {
    const leves = want.filter(d => (d.genreIds || []).some((g: number) => LEVES.has(+g)));
    const d = top(leves.length ? leves : want);
    const t = mom === "domingo" ? `☀️ Domingão pede algo leve: ${titulo(d)}` : `🛋️ Tarde livre? ${titulo(d)} cai bem`;
    return { title: t, body: "Tá no seu Quero ver." + veredito(d), url: link(d), img: capa(d), key: d.key };
  }
  // semana sem série em andamento: algo curto (série ou filme de até 1h50)
  const curtos = want.filter(d => d.type === "tv" || (d.runtime && d.runtime <= 110));
  const d = top(curtos.length ? curtos : want);
  const dur = d.type === "tv" ? (d.epRuntime ? `Episódio de ~${d.epRuntime} min.` : "Dá pra ver um ep e dormir.") : d.runtime ? `${Math.floor(d.runtime / 60)}h${String(d.runtime % 60).padStart(2, "0")}, cabe na noite.` : "Cabe na noite.";
  return { title: `🌙 Que tal ${titulo(d)} hoje?`, body: dur + veredito(d), url: link(d), img: capa(d), key: d.key };
}

async function sug() {
  const t = agoraBR();
  if (t.hora < 9 || t.hora >= 23) return 0;
  const subs: { user_id: string; visto_em: string; sug_em: string | null; sug_semana: { em: string; key: string }[]; horas: number[] }[] =
    await db(`push_subs?select=user_id,visto_em,sug_em,sug_semana,horas&avisos->>sug=eq.true&ativo=is.true`);
  const por = new Map<string, typeof subs>();
  for (const s of subs) por.set(s.user_id, [...(por.get(s.user_id) || []), s]);
  const inicioHoje = new Date(`${t.data}T00:00:00-03:00`).getTime();
  const semana = Date.now() - 7 * 864e5;
  let n = 0;
  for (const [u, l] of por) {
    const horas = Array.from({ length: 24 }, (_, h) => l.reduce((a, s) => a + (+(s.horas || [])[h] || 0), 0));
    const mom = momento(t, favorita(horas));
    if (!mom) continue;
    if (l.some(s => new Date(s.visto_em).getTime() >= inicioHoje)) continue;            // já abriu hoje
    if (l.some(s => s.sug_em && new Date(s.sug_em).getTime() >= inicioHoje)) continue;  // já mandei hoje
    const hist = l.flatMap(s => s.sug_semana || []).filter(x => new Date(x.em).getTime() > semana);
    const dias = new Set(hist.map(x => x.em.slice(0, 10)));
    if (dias.size >= 4) continue;                                                           // 4 por semana
    const itens: { data: any }[] = await db(`items?select=data&user_id=eq.${u}&deleted=is.false&data->>status=eq.want&limit=400`);
    const recentes = new Set(hist.map(x => x.key));
    let want = itens.map(i => i.data).filter(d => d && d.key);
    if (want.length > 3) want = want.filter(d => !recentes.has(d.key) || emAndamento(d));
    if (!want.length) continue;
    // dia de semana sem série em andamento: só 2 por semana (o fim de semana é prioridade)
    if (mom === "semana" && !want.some(emAndamento) && dias.size >= 2) continue;
    const a = await montar(u, mom, want);
    if (!a) continue;
    const { key, ...payload } = a;
    n += await mandar(u, "sug", { ...payload, tag: "sug" });
    const nova = [...hist, { em: new Date().toISOString(), key }].slice(-12);
    await db(`push_subs?user_id=eq.${u}`, { method: "PATCH", body: JSON.stringify({ sug_em: new Date().toISOString(), sug_semana: nova }) });
  }
  return n;
}

Deno.serve(async req => {
  if (req.method !== "POST") return new Response("nada aqui", { status: 404 });
  try {
    const c = await config();
    if (!c.push_segredo || req.headers.get("x-segredo") !== c.push_segredo) return new Response("não", { status: 401 });
    const b = await req.json();
    let n = 0;
    if (b.tipo === "msg") n = await msg(+b.id);
    else if (b.tipo === "ind") n = await ind(+b.id);
    else if (b.tipo === "sug") n = await sug();
    else if (b.tipo === "teste" && /^[0-9a-f-]{36}$/.test(b.user)) n = await mandar(b.user, "teste", { title: "🔔 Avisos ligados!", body: "É assim que a Cinemoteca vai te chamar 🍿", tag: "teste", url: APP });
    return new Response(JSON.stringify({ enviados: n }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response("erro", { status: 500 });
  }
});
