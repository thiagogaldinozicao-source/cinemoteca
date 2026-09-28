// Acesso à API do TMDB (https://developer.themoviedb.org).
const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/";
const LANG = "pt-BR";
const REGION = "BR";
const KEY_STORAGE = "cinemoteca_tmdb_key";

export function getKey() {
  try {
    const local = localStorage.getItem(KEY_STORAGE);
    if (local) return local.trim();
  } catch (e) { /* armazenamento indisponível */ }
  const cfg = (window.CINEMOTECA_CONFIG && window.CINEMOTECA_CONFIG.TMDB_KEY) || "";
  return cfg.trim();
}
export function setLocalKey(k) {
  try {
    if (k) localStorage.setItem(KEY_STORAGE, k.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch (e) { /* ignora */ }
}
export function hasLocalKey() {
  try { return !!localStorage.getItem(KEY_STORAGE); } catch (e) { return false; }
}

export class TmdbError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

const cache = new Map();

async function get(path, params = {}, { signal } = {}) {
  const key = getKey();
  if (!key) throw new TmdbError("no_key", "Sem chave do TMDB");
  const url = new URL(API + path);
  const headers = { accept: "application/json" };
  // Token v4 (JWT) vai no cabeçalho; chave v3 vai na URL.
  if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
  else url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  const ck = url.toString();
  if (cache.has(ck)) return cache.get(ck);
  let res;
  try {
    res = await fetch(url, { headers, signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new TmdbError("network", "Sem conexão");
  }
  if (res.status === 401) throw new TmdbError("bad_key", "Chave do TMDB inválida");
  if (res.status === 429) throw new TmdbError("rate", "Muitas buscas seguidas");
  if (!res.ok) throw new TmdbError("http", "Erro " + res.status);
  const data = await res.json();
  cache.set(ck, data);
  return data;
}

export function img(path, size = "w342") {
  return path ? IMG + size + path : "";
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

export async function search(query, opts) {
  const data = await get("/search/multi", { query, language: LANG, region: REGION, include_adult: "false" }, opts);
  return (data.results || [])
    .filter(r => r.media_type === "movie" || r.media_type === "tv")
    .map(r => normalize(r));
}

export async function trending(opts) {
  const data = await get("/trending/all/week", { language: LANG }, opts);
  return (data.results || [])
    .filter(r => r.media_type === "movie" || r.media_type === "tv")
    .map(r => normalize(r));
}

export async function details(type, id, opts) {
  const d = await get(`/${type}/${id}`, {
    language: LANG,
    append_to_response: "watch/providers,credits,videos,recommendations",
    include_video_language: "pt,en,null",
  }, opts);
  const base = normalize(d, type);
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
    episodes: type === "tv" ? d.number_of_episodes : null,
    status: d.status || "",
    tagline: d.tagline || "",
    providers: { stream: pick(prov.flatrate), rent: pick(prov.rent), buy: pick(prov.buy), link: prov.link || "" },
    trailer: trailer ? "https://www.youtube.com/watch?v=" + trailer.key : "",
    cast,
    director,
    recs: ((d.recommendations && d.recommendations.results) || []).slice(0, 12).map(r => normalize(r, r.media_type || type)),
  };
}

// Veredito honesto a partir da nota e do número de votos do TMDB.
export function verdict(vote, votes) {
  if (vote == null || votes < 50) return { label: "sem nota ainda", cls: "none" };
  if (vote >= 7.8) return { label: "vale muito", cls: "vm" };
  if (vote >= 7.0) return { label: "vale", cls: "v" };
  if (vote >= 6.0) return { label: "mais ou menos", cls: "mm" };
  return { label: "fraco", cls: "f" };
}
