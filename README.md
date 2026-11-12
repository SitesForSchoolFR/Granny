# ✦ NEBULA — Central de Jogos

A recriação, em **GitHub Pages**, dos 5 links de jogos (WebSight / LinkDuper) — com uma interface **minimalista, limpa e leve**: zero frameworks, zero build, só HTML + CSS + JS puro.

**Site:** `https://sitesforschoolfr.github.io/Nebula/`

## O que tem no site

- **217 jogos** — todos os jogos dos 5 links, verificados um a um:
  - biblioteca principal (Doom, GTA, Mario, FNAF, Half-Life, Moto X3M, 15 mods de Friday Night Funkin…)
  - **GN-Math** — 8 jogos da v1 (Calculus, Geometry, Equations, Fractions) + **GN-Math 2.0**
  - **DuckMath**
  - escolhidos a mão e biblioteca externa (Axiom, Noah's Hub…)
- **Paginação** — 24 jogos por página (fileiras e colunas); nada é carregado de uma vez
- **Jogar em `about:blank`** — como no site original: cada jogo abre numa janela `about:blank`
- **Espelhos (mirrors)** — botão 🔗 em cada card: vários CDNs/hosts do mesmo jogo (jsDelivr, githack, esm.sh, p5js, npm…) para quando a escola bloqueia um
- **Tabela de downloads** — todos os 77 arquivos reais dos repositórios (jogos `.html`, zips, ROMs, parts), com tamanho e botão de download direto
- **Mantle Launcher** (getmantle.pages.dev) — card com o site de download + 3 relays que abrem o Mantle no navegador
- **Os 5 links originais** — seção dedicada com status (4 ativos, 1 offline)
- **Partículas** — fundo estrelado animado em canvas (baixa / média / alta)
- **Configurações** — partículas, densidade, cursor e movimento reduzido (salvos em `localStorage`)
- **Cursor personalizado** — ponto no centro + círculo pequeno em volta, que segue o mouse suavemente com delay e animação
- **Busca** — encontre qualquer jogo instantaneamente
- **Palavra mágica** — digite `por favor` em qualquer lugar e veja o que acontece 🤫

## Estrutura

```
index.html   → página única (hero, jogos paginados, downloads, links)
style.css    → todo o visual (tema escuro, gradiente violeta/ciano)
app.js       → dados dos jogos, paginação, partículas, cursor, configurações, espelhos, downloads
```

## Como funciona o "Jogar"

1. O site abre uma janela `about:blank`
2. Em seguida, abre a **janela de jogo do NEBULA** (`jogo.html`), que exibe o jogo **em iframe**:
   - **Arquivos diretos** (Doom, GTA, Mario…): **hospedados no próprio site** (pasta `games/`, domínio GitHub Pages liberado na escola) — o emulador e as ROMs ainda vêm dos CDNs públicos
   - **GN-Math v1**: `raw.esm.sh` (repo `Why2ITry/gn-math-links-2-1`)
   - **GN-Math 2.0 / DuckMath**: npm/esm.sh/p5js (com espelhos)
   - **Demais jogos**: abrem no site original (WebSight via Google Apps Script)
3. O iframe contorna bloqueios de rede escolar (que costumam interceptar a navegação direta ao CDN e mostrar só o código)
4. Se o espelho principal falhar, a janela **troca automaticamente** para o alternativo (githack); há botões “Espelho” e “Abrir direto” na barra
5. Alguns jogos mostram um botão **“PLAY” ou “Load”** — é só clicar para começar (a janela avisa isso)
6. `Esc` fecha a janela do jogo

## Os 5 links

| # | `id`        | Status  |
|---|-------------|---------|
| 1 | `HVLL6YBBC5` | ✅ ativo |
| 2 | `V9KM79NFHC` | ✅ ativo |
| 3 | `J4JXSS9W3N` | ❌ offline (404) |
| 4 | `GEMXRNAA6W` | ✅ ativo |
| 5 | `HUZSGDFGGP` | ✅ ativo |

Todos apontam para o mesmo Apps Script:
`https://script.google.com/macros/s/AKfycbw3KzPix7iLtyJFB7eVqm2NCWhRoqSl0G38p7YeJm6KEHlETcuc-8jVnom69pUcwQUk/exec?id=…`

## Deploy

Workflow `.github/workflows/deploy.yml` (template oficial do GitHub Pages) — publica a cada push na `main`.

## Créditos

Jogos e capas hospedados por **P2P (WebSight/LinkDuper)**, pelos repositórios públicos do `Onex558`, pelo `classroomduck` (npm, DuckMath), `Why2ITry/gn-math-links-2-1` (GN-Math) e `getmantle.pages.dev` (Mantle Launcher). NEBULA é apenas a "casa" bonita onde tudo vive.

Feito para a escola ✦ 2026
