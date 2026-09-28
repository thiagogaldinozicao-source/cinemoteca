# 🎬 Cinemoteca

App pra ninguém mais esquecer aquele filme ou série que viu indicado por aí.
Busca qualquer título, mostra capa, sinopse, se vale a pena e **onde assistir no Brasil**,
e guarda sua lista de **Quero ver** e **Já vi**.

Funciona no navegador e dá pra instalar no celular como app (ícone na tela inicial).

## O que já faz

- 🔍 Busca por nome em todos os filmes e séries (base do TMDB), em português
- 🔥 Quando a busca está vazia, mostra o que está em alta na semana
- 🖼️ Capa, sinopse, gêneros, elenco, direção, trailer e títulos parecidos
- 📺 Onde assistir no Brasil: assinatura, aluguel e compra
- ✅ Veredito rápido (Vale muito 🔥 / Vale a pena ✅ / Sessão da tarde 🍿 / Não vale 👎) pela nota do público
- 📋 Lista **Quero ver** com fila que dá pra reordenar, e **Já vi** com sua nota de 1 a 10
- 📝 Anotação em cada título: quem indicou, onde viu, com quem quer ver
- 🎲 Sorteio de um título da sua fila
- 💾 Backup e restauração da lista (arquivo)
- 📱 Instalável e abre sem internet (a busca precisa de internet)
- 👤 Conta por e-mail (código no e-mail, sem senha): a lista fica na nuvem, igual em todo aparelho, e só o dono vê
- 🔐 Chave do TMDB escondida no servidor: ninguém precisa configurar nada

## Nuvem (Supabase)

| Arquivo | O que é |
|---|---|
| `supabase/schema.sql` | Tabela das listas + regras "cada um só vê a sua". Rodar no SQL Editor |
| `supabase/functions/tmdb/index.ts` | Função `tmdb`: faz a busca com a chave escondida (segredo `TMDB_KEY`) |
| `cloud.js` | Login e sincronização no app |
| `vendor/supabase.js` | Biblioteca do Supabase (cópia local, pra abrir sem internet) |
| `.github/workflows/manter-acordado.yml` | Dá um "oi" no Supabase a cada 3 dias pro projeto grátis não pausar |

No `config.js` vão só o endereço do projeto e a chave **pública** (publishable/anon).
Nunca a chave secret/service_role nem a do TMDB. Com esses campos vazios o app volta
pro modo antigo (lista só no aparelho, chave do TMDB em Ajustes).

Quem já tinha lista no aparelho: ao entrar pela primeira vez ela sobe pra conta
(e fica uma cópia de segurança no aparelho).

## Como colocar no ar (grátis, pelo GitHub Pages)

1. No GitHub, abra o repositório → **Settings** → **Pages**
2. Em **Build and deployment**, escolha **Deploy from a branch**
3. Branch **main**, pasta **/ (root)** → **Save**
4. Em 1 ou 2 minutos o link aparece ali mesmo, algo como
   `https://SEU-USUARIO.github.io/cinemoteca/`

## Chave do TMDB

A busca usa a API gratuita do [TMDB](https://www.themoviedb.org/).

1. Crie uma conta em themoviedb.org
2. Vá em **Configurações → API** e peça uma chave de uso pessoal
3. Copie a **API Key** (ou o **API Read Access Token**, o texto longo)
4. No app, abra **Ajustes → Chave do TMDB**, cole e salve

Com a nuvem ligada, a chave fica só no Supabase (segredo `TMDB_KEY` da função `tmdb`).
**Nunca coloque a chave no `config.js`**: este repositório é público.

## Estrutura

| Arquivo | O que é |
|---|---|
| `index.html` | A página do app |
| `styles.css` | Visual |
| `app.js` | Telas: lista, busca, detalhes, ajustes |
| `tmdb.js` | Conversa com a API do TMDB |
| `store.js` | Lista salva no aparelho |
| `sw.js` | Deixa o app abrir sem internet |
| `manifest.webmanifest`, `icons/` | Instalação como app |
| `config.js` | Configuração (chave padrão, deixe vazia) |

Não precisa instalar nada nem "compilar": são arquivos estáticos.

## Próximos passos

- Buscar por print ou por um trecho/cena do filme (usa IA)
- Compartilhar a lista com amigos

---

Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.
Dados de onde assistir fornecidos pela JustWatch.
