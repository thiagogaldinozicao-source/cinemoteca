// Acesso à API do TMDB (https://developer.themoviedb.org) pela função "tmdb" do
// Supabase, que guarda a chave escondida no servidor.
import * as cloud from "./cloud.js?v=23";

const IMG = "https://image.tmdb.org/t/p/";
const LANG = "pt-BR";
const REGION = "BR";
// A busca passa sempre pela função "tmdb" do Supabase (chave escondida lá).
export function ready() { return !!cloud.currentUser(); }

export class TmdbError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

const cache = new Map();

const get = (path, params = {}, opts = {}) => viaCloud(path, params, opts);

async function viaCloud(path, params, { signal } = {}) {
  const url = new URL(cloud.functionsUrl("tmdb"));
  url.searchParams.set("p", path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  const ck = url.toString();
  if (cache.has(ck)) return cache.get(ck);
  if (!navigator.onLine) throw new TmdbError("network", "Sem conexão");
  const token = await cloud.accessToken();
  if (!token) throw cloud.currentUser() ? new TmdbError("network", "Sem conexão") : new TmdbError("login", "Precisa entrar");
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: "Bearer " + token, apikey: cloud.publicKey() }, signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new TmdbError("network", "Sem conexão");
  }
  if (!res.ok) {
    let err = {};
    try { err = await res.json(); } catch (e) { /* sem corpo */ }
    if (res.status === 401) throw new TmdbError("login", "Precisa entrar de novo");
    if (res.status === 404) throw new TmdbError("no_function", "Função tmdb não publicada");
    if (err.error === "no_key") throw new TmdbError("server_key", "Falta a chave no servidor");
    if (err.error === "bad_key") throw new TmdbError("server_key", "Chave do servidor inválida");
    if (res.status === 429) throw new TmdbError("rate", "Muitas buscas seguidas");
    throw new TmdbError("http", "Erro " + res.status);
  }
  const data = await res.json();
  if (cache.size > 300) cache.clear();
  cache.set(ck, data);
  return data;
}

export function img(path, size = "w342") {
  // Só caminho do TMDB ("/abc.jpg"): qualquer outra coisa vira sem capa.
  return /^\/[\w.-]+$/.test(path || "") ? IMG + size + path : "";
}

function yearOf(d) { return d ? String(d).slice(0, 4) : ""; }

// Normaliza um resultado (filme ou série) para o formato do app.
export function normalize(r, type) {
  const t = type || r.media_type;
  const title = t === "tv" ? (r.name || r.original_name) : (r.title || r.original_title);
  const original = t === "tv" ? r.original_name : r.original_title;
  return {
    key: t + ":" + r.id,
    id: r.id,
    type: t,
    title: title || "Sem título",
    original: original && original !== title ? original : "",
    year: yearOf(t === "tv" ? r.first_air_date : r.release_date),
    poster: r.poster_path || "",
    backdrop: r.backdrop_path || "",
    overview: r.overview || "",
    vote: typeof r.vote_average === "number" ? r.vote_average : null,
    votes: r.vote_count || 0,
    genreIds: r.genre_ids || (r.genres || []).map(g => g.id),
  };
}

// Busca no mundo todo (filmes e séries de qualquer país, pelo título em
// português ou no original). Se o nome for de um ator ou diretor, traz
// também os trabalhos conhecidos dele.
export async function search(query, opts) {
  const data = await get("/search/multi", { query, language: LANG, include_adult: "false" }, opts);
  const out = [], seen = new Set();
  const push = (r, via) => {
    if (r.media_type !== "movie" && r.media_type !== "tv") return;
    const m = normalize(r);
    if (seen.has(m.key)) return;
    seen.add(m.key);
    if (via) m.via = via;
    out.push(m);
  };
  const results = data.results || [];
  results.forEach(r => push(r));
  results.filter(r => r.media_type === "person").slice(0, 2)
    .forEach(p => (p.known_for || []).forEach(k => push(k, p.name)));
  return out;
}

// Acha o título certo a partir de um nome (usado na importação de lista).
// Tenta cada nome dado, respeita o tipo (filme/série) e o ano (±1).
// Devolve { media, loose } — loose = achou algo parecido mas sem bater o ano.
export async function findBest({ q, original, title, year, type }, opts) {
  const names = [...new Set([q, original, title].filter(Boolean))];
  let fallback = null;
  for (const name of names) {
    const res = (await search(name, opts)).filter(r => !r.via && (!type || r.type === type));
    if (!res.length) continue;
    if (!year) return { media: res[0], loose: false };
    const hit = res.find(r => r.year && Math.abs(+r.year - year) <= 1);
    if (hit) return { media: hit, loose: false };
    if (!fallback) fallback = res[0];
  }
  return fallback ? { media: fallback, loose: true } : null;
}

export async function trending(opts) {
  const data = await get("/trending/all/week", { language: LANG }, opts);
  return (data.results || [])
    .filter(r => r.media_type === "movie" || r.media_type === "tv")
    .map(r => normalize(r));
}

// Descobre títulos bem avaliados de alguns gêneros (usado no "Pra você").
export async function discover(type, genreIds, { without = [], page = 1 } = {}, opts) {
  const data = await get(`/discover/${type}`, {
    language: LANG, region: REGION, include_adult: "false", page,
    with_genres: genreIds.join("|"),
    ...(without.length ? { without_genres: without.join(",") } : {}),
    sort_by: "popularity.desc",
    "vote_count.gte": type === "tv" ? 150 : 300,
    "vote_average.gte": 6.8,
  }, opts);
  return (data.results || []).map(r => normalize(r, type));
}

export async function details(type, id, opts) {
  const d = await get(`/${type}/${id}`, {
    language: LANG,
    append_to_response: "watch/providers,credits,videos,recommendations",
    include_video_language: "pt,en,null",
  }, opts);
  const base = normalize(d, type);
  if (!base.overview) {
    try {
      const en = await get(`/${type}/${id}`, { language: "en-US" }, opts);
      if (en.overview) { base.overview = en.overview; base.overviewLang = "en"; }
    } catch (e) { if (e.name === "AbortError") throw e; }
  }
  const prov = (d["watch/providers"] && d["watch/providers"].results && d["watch/providers"].results[REGION]) || {};
  const pick = arr => (arr || []).map(p => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path }));
  const vids = (d.videos && d.videos.results) || [];
  const trailer = vids.find(v => v.site === "YouTube" && v.type === "Trailer" && v.iso_639_1 === "pt")
    || vids.find(v => v.site === "YouTube" && v.type === "Trailer")
    || vids.find(v => v.site === "YouTube");
  const cast = ((d.credits && d.credits.cast) || []).slice(0, 6).map(c => c.name);
  const director = type === "movie"
    ? ((d.credits && d.credits.crew) || []).filter(c => c.job === "Director").map(c => c.name).slice(0, 2)
    : (d.created_by || []).map(c => c.name).slice(0, 2);
  return {
    ...base,
    genres: (d.genres || []).map(g => g.name),
    runtime: type === "movie" ? d.runtime : null,
    seasons: type === "tv" ? d.number_of_seasons : null,
    epRuntime: type === "tv" ? epRun(d) : null,
    episodes: type === "tv" ? d.number_of_episodes : null,
    // episódios de cada temporada (sem os "especiais", temporada 0)
    temps: type === "tv" ? (d.seasons || []).filter(x => x.season_number > 0).sort((a, b) => a.season_number - b.season_number).map(x => x.episode_count || 0) : null,
    status: d.status || "",
    tagline: d.tagline || "",
    providers: { stream: pick(prov.flatrate), rent: pick(prov.rent), buy: pick(prov.buy), link: prov.link || "" },
    trailer: trailer ? "https://www.youtube.com/watch?v=" + trailer.key : "",
    trailerKey: trailer ? trailer.key : "",
    cast,
    director,
    recs: ((d.recommendations && d.recommendations.results) || []).slice(0, 12).map(r => normalize(r, r.media_type || type)),
  };
}

function epRun(d) {
  return (d.episode_run_time && d.episode_run_time[0]) || (d.last_episode_to_air && d.last_episode_to_air.runtime) || null;
}
// Só duração e gêneros (chamada leve, usada pra montar sugestões).
export async function meta(type, id, opts) {
  const d = await get(`/${type}/${id}`, { language: LANG }, opts);
  return {
    runtime: type === "movie" ? d.runtime || null : null,
    epRuntime: type === "tv" ? epRun(d) : null,
    genreIds: (d.genres || []).map(g => g.id),
  };
}

// Veredito honesto a partir da nota e do número de votos do público no TMDB.
export function verdict(vote, votes) {
  if (vote == null || votes < 50) return { label: "Sem nota ainda", cls: "none", emoji: "❔", why: "Pouca gente avaliou ainda. Vale conferir o trailer." };
  // Com poucos votos (lançamento recente) a nota costuma vir inflada pelos fãs.
  if (vote >= 7.8 && votes < 300) return { label: "Vale a pena", cls: "v", emoji: "✅", why: "Começou muito bem avaliado, mas ainda com poucos votos. Pode mudar." };
  if (vote >= 7.8) return { label: "Vale muito", cls: "vm", emoji: "🔥", why: "Aclamado pelo público. Prioridade na fila." };
  if (vote >= 7.0) return { label: "Vale a pena", cls: "v", emoji: "✅", why: "Bem avaliado. Boa escolha pra hoje." };
  if (vote >= 6.0) return { label: "Sessão da tarde", cls: "mm", emoji: "🍿", why: "Diverte sem compromisso. Bom pra desligar a cabeça." };
  return { label: "Não vale", cls: "f", emoji: "👎", why: "Mal avaliado pelo público. Só se for muita curiosidade." };
}
