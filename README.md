# ✦ NEBULA — Central de Jogos

A recriação, em **GitHub Pages**, dos 5 links de jogos (WebSight / LinkDuper) — com uma interface **minimalista, limpa e leve**: zero frameworks, zero build, só HTML + CSS + JS puro.

## O que tem no site

- **210 jogos** — todos os jogos dos 5 links (biblioteca principal, escolhidos a mão e biblioteca externa)
- **Jogar em `about:blank`** — como no site original: cada jogo abre numa janela `about:blank`
- **Download de todos os jogos** — quando o arquivo existe em repositório público, o site baixa direto no navegador (fetch → blob); caso contrário, abre o site original
- **Os 5 links originais** — seção dedicada com status (4 ativos, 1 offline)
- **Partículas** — fundo estrelado animado em canvas (baixa / média / alta)
- **Configurações** — partículas, densidade, cursor e movimento reduzido (salvos em `localStorage`)
- **Cursor personalizado** — um ponto no centro + um círculo pequeno em volta, que segue o mouse suavemente com delay e animação
- **Busca** — encontre qualquer jogo instantaneamente
- **Palavra mágica** — digite `por favor` em qualquer lugar e veja o que acontece 🤫

## Estrutura

```
index.html   → página única
style.css    → todo o visual (tema escuro, gradiente violeta/ciano)
app.js       → dados dos jogos, partículas, cursor, configurações, downloads
```

## Como funciona o "Jogar"

1. O site abre uma janela `about:blank`
2. Em seguida, redireciona essa janela para o URL do jogo:
   - **Arquivos diretos** (Doom, GTA, Mario, FNAF…): servidos pelo CDN do jsDelivr a partir dos repositórios públicos `Onex558/uranium-source-` e `Onex558/retro-games-`
   - **Demais jogos**: abrem no site original (WebSight via Google Apps Script), que continua hospedando tudo

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

GitHub Pages → branch `main` → raiz do repositório. Basta fazer push; o `index.html` está na raiz.

## Créditos

Jogos e capas hospedados por **P2P (WebSight/LinkDuper)** e pelos repositórios públicos do `Onex558` (jsDelivr CDN). NEBULA é apenas a "casa" bonita onde tudo vive.

Feito para a escola ✦ 2026
