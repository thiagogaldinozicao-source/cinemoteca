// Função "tmdb" da Cinemoteca (Supabase Edge Function).
// Faz a busca no TMDB com a chave guardada no servidor, só para quem está logado.
// A chave fica no segredo TMDB_KEY (Edge Functions → Secrets). Nunca no código.
//
// Uso pelo app: GET /functions/v1/tmdb?p=/search/multi&query=...&language=pt-BR

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Só estes caminhos do TMDB podem ser pedidos.
const PATHS = /^\/(search\/multi|trending\/all\/week|(movie|tv)\/\d{1,9})$/;
const PARAMS = new Set(["query", "language", "include_adult", "append_to_response", "include_video_language", "page", "region"]);

// Lembra por alguns minutos quem já foi conferido (menos idas ao login).
const seen = new Map<string, number>();

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

async function loggedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || token.startsWith("sb_")) return false;
  const now = Date.now();
  const exp = seen.get(token);
  if (exp && exp > now) return true;
  const url = Deno.env.get("SUPABASE_URL");
  const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const r = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey } });
  if (!r.ok) return false;
  if (seen.size > 5000) seen.clear();
  seen.set(token, now + 5 * 60 * 1000);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "method" }, 405);

  if (!(await loggedIn(req))) return json({ error: "login" }, 401);

  const key = (Deno.env.get("TMDB_KEY") || "").trim();
  if (!key) return json({ error: "no_key" }, 500);

  const inUrl = new URL(req.url);
  const path = inUrl.searchParams.get("p") || "";
  if (!PATHS.test(path)) return json({ error: "path" }, 400);

  const out = new URL("https://api.themoviedb.org/3" + path);
  for (const [k, v] of inUrl.searchParams) if (PARAMS.has(k)) out.searchParams.set(k, v.slice(0, 200));
  const headers: Record<string, string> = { accept: "application/json" };
  // Token longo (v4) vai no cabeçalho; chave curta (v3) vai na URL.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  else out.searchParams.set("api_key", key);

  let r: Response;
  try { r = await fetch(out, { headers }); }
  catch { return json({ error: "tmdb_down" }, 502); }

  if (r.status === 401) return json({ error: "bad_key" }, 500);
  if (r.status === 429) return json({ error: "rate" }, 429);
  if (!r.ok) return json({ error: "http", status: r.status }, 502);

  const cache = path.startsWith("/search") ? "private, max-age=600" : "private, max-age=3600";
  return new Response(await r.text(), {
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache },
  });
});
