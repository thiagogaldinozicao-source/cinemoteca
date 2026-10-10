# 🎬 Cinemoteca

Lista de filmes e séries: busca qualquer título (TMDB), diz se vale a pena e onde assistir no Brasil, guarda **Quero ver** / **Já vi**, sorteia o que ver e conecta amigos (ver a lista um do outro e mandar indicação). PWA: instala na tela de início do iPhone e abre sem internet.

Site: https://thiagogaldinozicao-source.github.io/cinemoteca

## Como rodar no computador

Não tem build. Na pasta do projeto:

```
python3 -m http.server 8000
```

e abre http://localhost:8000. Usa o mesmo Supabase do site (login por código no e-mail).

## Como publicar

1. Sobe a versão: `./versao.sh 22` (troca todos os `?v=` e o cache do `sw.js` de uma vez).
2. `git commit` e `git push` na `main`. O GitHub Pages publica sozinho em ~1 min.
3. No iPhone: o app abre na hora com a versão guardada e baixa a nova por trás. Quando termina, aparece "Tem versão nova" com o botão **Atualizar** (ou é só fechar e abrir de novo).

Ícones têm versão separada (`?v=N` nos links de ícone e no `manifest.webmanifest`). Pra trocar o ícone no iPhone tem que apagar o atalho e adicionar de novo.

## Onde mexer

| Quero mudar… | Arquivo |
|---|---|
| Telas, textos, botões | `app.js` (dividido por seções `// ---------- NOME ----------`) |
| Visual, cores | `styles.css` (cores no topo, em `:root`) |
| Lista no aparelho, backup | `store.js` |
| Login e sincronização com a nuvem | `cloud.js` |
| Busca no TMDB, veredito (Vale muito / Não vale) | `tmdb.js` |
| "O que ver agora?" (dia, hora, duração) | `now.js` |
| Gêneros e "Pra você" | `gostos.js` |
| Amigos, convites, indicações | `amigos.js` + `supabase/amigos.sql` |
| Conversa entre amigos | `chat.js` + `supabase/chat.sql` |
| Avisos no celular (notificação) | `push.js` + `sw.js` (receber) + `supabase/functions/push` (mandar) |
| Sons e vibração | `sons.js` |
| Abrir sem internet, cache | `sw.js` |
| Endereço e chave pública do Supabase | `config.js` |

## Nuvem (Supabase, plano grátis)

- Projeto `cinemoteca` (São Paulo). Tabelas: `items` (listas), `gostos`, `perfis`, `amizades`, `indicacoes`. Todas com RLS: cada um só vê o que é seu; o que é de amigo passa por funções que conferem a amizade.
- SQL em `supabase/`, rodar no SQL Editor nesta ordem: `schema.sql`, `amigos.sql`, `fotos.sql`, `chat.sql`.
- Avisos: função `push` (`supabase/functions/push`) manda as notificações. Quem chama é o banco (gatilho em `mensagens` e `indicacoes`) e um agendamento de hora em hora (das 9h às 22h; sugestão esperta: horário de cada um, sexta/sábado/domingo, feriado, série em andamento; no máx. 1 por dia e 4 por semana). Chaves VAPID e o segredo ficam no Vault (ver fim do `chat.sql`); a pública vai no `config.js`.
- Indicação e filme mandado na conversa são a mesma coisa: `indicar` também grava na conversa e `mandar_msg` com filme também grava a indicação (as duas funções estão no `chat.sql`).
- Travas contra abuso (o cadastro é aberto): 3000 títulos por conta, 60 indicações por hora, 30 mensagens por minuto e 1500 por dia, 10 aparelhos com aviso por conta.
- Função nova no banco nasce liberada pra todo mundo: depois de criar ou recriar uma, rodar o `revoke ... from public, anon` dela (tem um bloco pronto no `chat.sql`) e conferir em Advisors → Security.
- Função `tmdb` (`supabase/functions/tmdb`): faz a busca com a chave escondida no segredo `TMDB_KEY`.
- `.github/workflows/manter-acordado.yml` dá um "oi" a cada 3 dias pro projeto grátis não pausar.
- No `config.js` só vai a chave **pública**. Nunca a `service_role` nem a do TMDB.
