// Gostos da pessoa (gêneros), escolhidos na primeira entrada, estilo Spotify.
// Ficam na conta (Supabase) e numa cópia no aparelho.
import * as cloud from "./cloud.js?v=13";
import * as store from "./store.js?v=13";
import * as tmdb from "./tmdb.js?v=13";

// Gêneros do TMDB: filmes e séries usam números diferentes.
export const GENEROS = [
  { id: "romance", label: "Romance", emoji: "💕", movie: [10749], tv: [] },
  { id: "comedia", label: "Comédia", emoji: "😂", movie: [35], tv: [35] },
  { id: "drama", label: "Drama", emoji: "🎭", movie: [18], tv: [18] },
  { id: "acao", label: "Ação", emoji: "💥", movie: [28], tv: [10759] },
  { id: "suspense", label: "Suspense", emoji: "😰", movie: [53], tv: [9648] },
  { id: "terror", label: "Terror", emoji: "👻", movie: [27], tv: [] },
  { id: "crime", label: "Crime", emoji: "🕵️", movie: [80], tv: [80] },
  { id: "misterio", label: "Mistério", emoji: "🔎", movie: [9648], tv: [9648] },
  { id: "ficcao", label: "Ficção científica", emoji: "🚀", movie: [878], tv: [10765] },
  { id: "fantasia", label: "Fantasia", emoji: "🐉", movie: [14], tv: [10765] },
  { id: "aventura", label: "Aventura", emoji: "🗺️", movie: [12], tv: [10759] },
  { id: "animacao", label: "Animação", emoji: "🎨", movie: [16], tv: [16] },
  { id: "familia", label: "Família", emoji: "👨‍👩‍👧", movie: [10751], tv: [10751] },
  { id: "documentario", label: "Documentário", emoji: "🌍", movie: [99], tv: [99] },
  { id: "guerra", label: "Guerra", emoji: "🪖", movie: [10752], tv: [10768] },
  { id: "historia", label: "Histórico", emoji: "🏛️", movie: [36], tv: [] },
  { id: "faroeste", label: "Faroeste", emoji: "🤠", movie: [37], tv: [37] },
  { id: "musical", label: "Musical", emoji: "🎵", movie: [10402], tv: [] },
];
const BY_ID = Object.fromEntries(GENEROS.map(g => [g.id, g]));

// undefined = ainda não sei (carregando/sem internet); null = nunca escolheu; objeto = escolhido
let atual;
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); }
function emit() { listeners.forEach(fn => fn()); }

function localKey() { const u = cloud.currentUser(); return "cinemoteca_gostos_" + (u ? u.id : "aparelho"); }
function readLocal() { try { return JSON.parse(localStorage.getItem(localKey()) || "null"); } catch (e) { return null; } }
function writeLocal(d) { try { localStorage.setItem(localKey(), JSON.stringify(d)); } catch (e) { /* ignora */ } }

export function get() { return atual; }
// Precisa mostrar o questionário?
export function precisaPerguntar() { return atual === null; }

// Carrega (aparelho primeiro; se não tiver, pergunta pra nuvem).
let carregando = null;
export async function carregar() {
  const local = readLocal();
  if (local) { atual = local; emit(); return; }
  if (!cloud.enabled) { atual = null; emit(); return; }
  if (!cloud.currentUser()) { atual = undefined; return; }
  if (carregando) return carregando;
  carregando = (async () => {
    try {
      const d = await cloud.loadGostos();
      atual = d || null;
      if (d) writeLocal(d);
    } catch (e) { atual = undefined; } // sem internet: não pergunta agora
    carregando = null;
    emit();
  })();
  return carregando;
}
export function reset() { atual = undefined; }

export async function salvar(generos, tipo, pulou = false) {
  const d = { generos: generos.filter(g => BY_ID[g]), tipo: tipo || "ambos", pulou: !!pulou, at: Date.now() };
  atual = d; writeLocal(d); emit();
  if (cloud.enabled && cloud.currentUser()) cloud.saveGostos(d).catch(() => {});
  return d;
}

// Sugere gêneros a partir do que já está na lista (pra quem já usa o app).
export function palpite() {
  const cont = {};
  for (const it of store.all()) for (const gid of it.genreIds || []) cont[gid] = (cont[gid] || 0) + 1;
  const score = GENEROS.map(g => ({ id: g.id, n: [...new Set([...g.movie, ...g.tv])].reduce((a, x) => a + (cont[x] || 0), 0) }))
    .filter(x => x.n >= 3).sort((a, b) => b.n - a.n);
  return score.slice(0, 4).map(x => x.id);
}
export function label(id) { const g = BY_ID[id]; return g ? `${g.emoji} ${g.label}` : id; }

// "Pra você": títulos bem avaliados dos gêneros escolhidos, sem o que já está na lista.
const SEMPRE_FORA = { animacao: 16, familia: 10751, documentario: 99 };
export async function praVoce(soGenero, opts) {
  const d = atual;
  if (!d || !d.generos || !d.generos.length) return [];
  const ids = soGenero ? [soGenero] : d.generos;
  const escolhidos = ids.map(i => BY_ID[i]).filter(Boolean);
  const tipos = d.tipo === "movie" ? ["movie"] : d.tipo === "tv" ? ["tv"] : ["movie", "tv"];
  // Tira animação/família/documentário se a pessoa não escolheu (evita desenho no meio do romance).
  const fora = Object.entries(SEMPRE_FORA).filter(([k]) => !d.generos.includes(k)).map(([, v]) => v);
  const page = 1 + (new Date().getDate() % 3); // muda um pouco a cada dia
  const listas = await Promise.all(tipos.map(t => {
    const gids = [...new Set(escolhidos.flatMap(g => g[t]))];
    if (!gids.length) return [];
    const without = t === "tv" ? [...fora, 10762, 10763, 10764, 10767] : fora;
    return tmdb.discover(t, gids, { without, page }, opts).catch(e => { if (e.name === "AbortError") throw e; return []; });
  }));
  // Intercala filme e série e tira o que já está na lista.
  const out = [], seen = new Set();
  const max = Math.max(...listas.map(l => l.length), 0);
  for (let i = 0; i < max; i++) for (const l of listas) {
    const m = l[i];
    if (m && !seen.has(m.key) && !store.get(m.key)) { seen.add(m.key); out.push(m); }
  }
  return out.slice(0, 20);
}
