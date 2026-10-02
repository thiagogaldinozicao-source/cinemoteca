// Configuração da Cinemoteca.
//
// SUPABASE_URL e SUPABASE_KEY: endereço do projeto e a chave PÚBLICA
// ("publishable" ou "anon") do Supabase. Essas duas PODEM ficar aqui no
// repositório público: são feitas pra ir no app. Quem protege as listas são
// as regras do banco (cada pessoa só vê a própria).
//
// NUNCA coloque aqui a chave "secret" / "service_role" do Supabase nem a chave
// do TMDB. A do TMDB fica escondida no servidor (segredo TMDB_KEY da função).
window.CINEMOTECA_CONFIG = {
  SUPABASE_URL: "https://tcdsohxqqpktanfklpgi.supabase.co",
  SUPABASE_KEY: "sb_publishable_8kjom4laQuSN_9qCkIoZQg_HAZCgvdd",
  // Chave PÚBLICA dos avisos no celular (a privada fica no Vault do Supabase).
  VAPID_PUBLIC: "BDXE2LGkDk85y-uCpU4MPP0IsK_j3Wtgm1zGv5xOiV0v7aqjgPnhxtBBwP7dUfOKZoVDBq706QIc67LMzEp4Q6o"
};
