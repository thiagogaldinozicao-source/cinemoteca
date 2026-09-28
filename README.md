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
- ✅ Veredito rápido (vale muito / vale / mais ou menos / fraco) pela nota do público
- 📋 Lista **Quero ver** com fila que dá pra reordenar, e **Já vi** com sua nota de 1 a 10
- 🎲 Sorteio de um título da sua fila
- 💾 Backup e restauração da lista (arquivo)
- 📱 Instalável e abre sem internet (a busca precisa de internet)

A lista fica salva **só no aparelho de cada pessoa**. Nada é enviado pra servidor nenhum.

## Como colocar no ar (grátis, pelo GitHub Pages)

1. No GitHub, abra o repositório → **Settings** → **Pages**
2. Em **Build and deployment**, escolha **Deploy from a branch**
3. Branch **main**, pasta **/ (root)** → **Save**
4. Em 1 ou 2 minutos o link aparece ali mesmo, algo como
   `https://SEU-USUARIO.github.io/cinemoteca/`

## Chave do TMDB (necessária pra busca)

A busca usa a API gratuita do [TMDB](https://www.themoviedb.org/).

1. Crie uma conta em themoviedb.org
2. Vá em **Configurações → API** e peça uma chave de uso pessoal
3. Copie a **API Key** (ou o **API Read Access Token**, o texto longo)
4. No app, abra **Ajustes → Chave do TMDB**, cole e salve

A chave fica salva só no seu aparelho. **Não coloque a chave no `config.js`**:
este repositório é público e qualquer pessoa veria. Pra liberar a busca pra amigos
sem cada um ter chave, o próximo passo é um pequeno servidor que guarda a chave escondida.

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

- Login pra lista sincronizar entre celular e computador
- Servidor pequeno guardando a chave do TMDB, pra amigos usarem sem configurar nada
- Buscar por print ou por um trecho/cena do filme (usa IA)
- Compartilhar a lista com amigos

---

Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.
Dados de onde assistir fornecidos pela JustWatch.
