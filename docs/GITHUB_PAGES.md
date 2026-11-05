# GitHub Pages — Escape House

Tudo o que pode fazer o jogo "funcionar local e quebrar no Pages", e como
conferir antes de descobrir pelo celular.

Sumário:

1. [Como o deploy acontece](#1-como-o-deploy-acontece)
2. [O `base` e por que ele quebra tudo](#2-o-base-e-por-que-ele-quebra-tudo)
3. [Como referenciar um asset (e como não referenciar)](#3-como-referenciar-um-asset-e-como-não-referenciar)
4. [Orçamento de tamanho](#4-orçamento-de-tamanho)
5. [Draco](#5-draco)
6. [Checklist antes de commitar](#6-checklist-antes-de-commitar)
7. [Depois do primeiro deploy](#7-depois-do-primeiro-deploy)
8. [Sintomas e causas](#8-sintomas-e-causas)

---

## 1. Como o deploy acontece

`.github/workflows/deploy.yml`, nos pushes para `main` e em `workflow_dispatch`:

```
npm ci → npm run smoke → npm run build → upload-pages-artifact (dist/) → deploy-pages
```

O **smoke roda antes do build**: se um teste falhar, nada é publicado. O job
precisa de `permissions: contents: read, pages: write, id-token: write`.

Uma vez, no repositório: **Settings → Pages → Source: GitHub Actions**. Sem
isso o workflow publica e ninguém vê.

O artifact publicado é só `dist/` — `src/`, `tools/` e `node_modules/` não vão
para o site.

## 2. O `base` e por que ele quebra tudo

Um projeto de Pages em repositório de projeto é servido em

```
https://<usuario>.github.io/<repo>/
```

ou seja, **a raiz do site não é a raiz do domínio**. Todo caminho absoluto
emitido no HTML precisa levar o prefixo.

`vite.config.js`:

```js
const REPO_NAME = 'Granny-Inspiration-IG'

base: command === 'serve' ? '/' : `/${REPO_NAME}/`
```

- **build** → `/Granny-Inspiration-IG/` (bate com o Pages);
- **dev/preview local** → `/` (senão o `npm run dev` abre em 404).

Duas regras decorrentes:

1. `REPO_NAME` tem que ser **exatamente** o nome do repositório, com a mesma
   caixa. `granny-inspiration-IG` não é `Granny-Inspiration-IG` para o GitHub.
2. Renomear o repositório exige mudar aqui — é o primeiro lugar a olhar quando
   o site recém-renomeado para de carregar.

## 3. Como referenciar um asset (e como não referenciar)

| onde está o arquivo | como referenciar | exemplo |
| --- | --- | --- |
| `public/…` (textura, áudio, modelo) | `publicUrl('textures/wall.webp')` de `core/AssetLoader.js` | `publicUrl('audio/step.ogg')` |
| do lado do código (`src/…`) | `new URL('./x.png', import.meta.url)` | ícone embutido no bundle |

**Nunca** escreva `/textures/wall.webp` nem `src="/audio/x.ogg"` no HTML: com
`base` num subdiretório, `/` significa a raiz do *domínio*, e o Pages devolve
404. É o erro número um de Vite + Pages.

`publicUrl()` resolve o `base` na hora — por isso o loader usa ele e não uma
string crua.

## 4. Orçamento de tamanho

O limite do Pages é generous (repo < 1 GB), mas quem paga o load é o
visitante. As regras do doc da Parte 1, que valem para cada asset novo:

| tipo | regra |
| --- | --- |
| textura | ≤ 1024² em `.webp`; 2048² só em parede/chão de close-up |
| áudio | `.mp3` (compatibilidade) e/ou `.ogg` (menor); **nunca** `.wav` |
| modelo | low-poly `.glb`, Draco quando grande |
| código | bundle do jogo separado do `three` (já configurado) |

Estado atual do bundle (`npm run build`):

```
dist/index.html                 ~2 kB
dist/assets/style-*.css         ~8.6 kB  (gzip ~2.6)
dist/assets/index-*.js         ~82 kB  (gzip ~28)
dist/assets/three-*.js         ~630 kB (gzip ~158)
```

`three` fica em chunk próprio (`advancedChunks.groups`) para o cache do
navegador sobreviver a updates do jogo — e é o número a observar: tudo o que
entrar em `node_modules/three` novo aparece aqui.

**Lazy loading por cômodo** (pedido do doc): a casa é gerada em runtime, então
não há "carregar o próximo cômodo" — o custo é um único `build()`. O ponto de
extensão para quando existirem modelos por sala é `core/AssetLoader.js`
(`load()` por grupo do manifesto, chamado sob demanda por `House`).

## 5. Draco

Nada de Draco é baixado hoje: o loader só liga o `DRACOLoader` se algum modelo
do manifesto declarar `draco: true`.

Quando isso acontecer:

```bash
npm run vendor:draco     # copia o decoder de node_modules/three para public/vendor/draco
```

`public/vendor/` está no `.gitignore` (é derivado), e o CI **não** roda esse
script — então, no commit em que você ligar Draco num modelo, rode o script e
commite `public/vendor/draco` (removendo a linha do `.gitignore`) **ou**
adicione `npm run vendor:draco` ao workflow. Esquecer = modelo não carrega, e
o loader cai no placeholder procedural.

## 6. Checklist antes de commitar

```bash
npm run smoke        # 27 testes de lógica
npm run build        # tem que passar sem warning de UNRESOLVED_IMPORT
npm run preview      # abre em http://localhost:4173/Granny-Inspiration-IG/
```

No preview, confira:

1. a página abre **no caminho com o nome do repo** (não na raiz);
2. `dist/index.html` referencia `/Granny-Inspiration-IG/assets/…` — nunca
   `/assets/…`;
3. o console não mostra 404 de asset;
4. `?debug` mostra o overlay e o FPS; `?seed=1` produz a mesma casa/item.

```bash
grep -oE '(href|src)="/[^"]+"' dist/index.html
# esperado: /Granny-Inspiration-IG/... em tudo
```

## 7. Depois do primeiro deploy

- A URL final: `https://sitesforschoolfr.github.io/Granny-Inspiration-IG/`
- Primeiro deploy pode levar alguns minutos; os seguintes, ~1 min.
- `Settings → Pages` mostra o último deploy e o hash do commit publicado — é
  lá que se confirma que o push gerou site.
- O `404.html` do Pages é o do tema por padrão: se quiser um 404 do jogo, o
  arquivo tem que existir em `public/404.html`.

## 8. Sintomas e causas

| sintoma | causa quase sempre |
| --- | --- |
| tela branca, console cheio de 404 em `/assets/...` | `base` errado ou caminho absoluto no HTML |
| funciona no `npm run dev`, 404 no Pages | asset referenciado como `/textures/...` em vez de `publicUrl()` |
| CSS/JS carregam, textura não | arquivo em `src/` referenciado como se estivesse em `public/` (ou vice-versa) |
| modelo não aparece, sem erro | falta `npm run vendor:draco` (se o manifesto pediu `draco: true`) |
| deploy passa, site não muda | cache agressivo do navegador; confira o hash no `Settings → Pages` |
| "Blocked request / host not allowed" no preview local | `server.allowedHosts` — já liberado no `vite.config.js` |
| `manualChunks is not a function` | Vite 8 usa rolldown: use `output.advancedChunks.groups` |
