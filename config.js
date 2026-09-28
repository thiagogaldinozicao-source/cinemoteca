// Configuração da Cinemoteca.
//
// SUPABASE_URL e SUPABASE_KEY: endereço do projeto e a chave PÚBLICA
// ("publishable" ou "anon") do Supabase. Essas duas PODEM ficar aqui no
// repositório público: são feitas pra ir no app. Quem protege as listas são
// as regras do banco (cada pessoa só vê a própria).
//
// NUNCA coloque aqui a chave "secret" / "service_role" do Supabase nem a chave
// do TMDB. A do TMDB fica escondida no servidor (segredo TMDB_KEY da função).
//
// Com os dois campos vazios o app funciona no modo antigo (lista só no
// aparelho e chave do TMDB colada em Ajustes).
window.CINEMOTECA_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_KEY: "",
  TMDB_KEY: ""
};
