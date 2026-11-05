# Escape House

Jogo de terror e furtividade em primeira pessoa no navegador, inspirado em
_Granny_. Você acorda trancado numa casa. Explore, recolha itens, resolva os
puzzles e **saia** antes que ela encontre você — quantas vezes forem
necessárias, até o limite de tentativas. Sem armas: só furtividade e raciocínio.

- **Jogar:** <https://sitesforschoolfr.github.io/Granny/>
- **Stack:** Three.js + Vite, JavaScript puro (ESM), sem framework.
- **Status:** Parte 1/5 do design doc implementada. Partes 2–5 têm encaixes
  reservados — ver [`docs/PARTES.md`](docs/PARTES.md).

```bash
npm ci
npm run dev        # http://localhost:5173
```

> O `npm run dev` já sobe em `0.0.0.0` e aceita qualquer host (necessário para
> funcionar dentro de preview/sandbox).

---

## Como jogar

| tecla | ação |
| --- | --- |
| `W A S D` / setas | andar |
| mouse | olhar |
| `Shift` | correr (faz barulho) |
| `Ctrl` / `C` | agachar (anda devagar, quase silencioso) |
| `E` | interagir: pegar, revistar, abrir porta, esconder |
| `F` / `Espaço` | usar item da mão |
| `Q` | largar |
| `L` | lanterna |
| `Tab` | listar o inventário |
| `M` | onde estou |
| `Esc` / `P` | pausar |
| `` ` `` | overlay de debug (FPS, estado da IA) |

**Regra de ouro:** correr chama atenção, agachar não. A Granny ouve passos e
vê dentro de um cone — quebrar a linha de visão e se esconder funciona; ficar
parado em campo aberto, não.

**Para fugir:** a porta da frente está trancada por cadeado. Ache a **chave
mestra** e o **bilhete com o código** (escondidos nos móveis, sorteados a cada
run), depois abra a porta da frente.

Parâmetros de URL: `?debug` · `?seed=123` (run reproduzível) ·
`?quality=low|medium|high` · `?diff=easy|normal|nightmare`.

**Sem WebGL?** O jogo não trava numa tela de erro: ele entra em **modo 2D**
(planta baixa vista de cima, desenhada em canvas) e segue jogável — mesma
casa, mesmas regras, outro ponto de vista.

---

## Scripts

| comando | o que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento (Vite) |
| `npm run build` | build de produção para `dist/` |
| `npm run preview` | serve `dist/` no caminho do Pages (`/Granny/`) |
| `npm run smoke` | 27 testes de lógica headless (sem navegador) |
| `npm run check` | `smoke` + `build` — o que o CI roda |
| `npm run vendor:draco` | copia o decoder Draco para `public/vendor/draco` (só se algum modelo pedir `draco: true`) |

Node ≥ 20.

---

## Estrutura

```
public/{models,textures,audio}/   assets — TODOS opcionais
src/core/      config, eventos, estados, engine, assets, orquestrador (Game)
src/world/     floor plan (ASCII), colisão, portas, casa, POIs
src/player/    input (Pointer Lock), movimento, inventário
src/ai/        grafo de navegação + IA da Granny
src/systems/   ruído, puzzles, save, catálogo de itens
src/audio/     Web Audio posicional + síntese procedural
src/ui/        HUD, menus e todos os textos (pt-BR)
tools/         smoke tests + vendor do Draco
```

Detalhes em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## Assets

**Nenhum asset é obrigatório.** Sem `.glb`, sem `.png`, sem `.ogg`, o jogo roda
igual: texturas são desenhadas em `<canvas>`, modelos viram primitivas e sons
são sintetizados no `AudioContext`. Faltando arquivo, o loader avisa no console
e segue.

Isso significa que o repositório clonado roda sem baixar binário nenhum — e que
o Pages nunca quebra por um asset esquecido.

Regras para quem for adicionar: textura ≤ 1024² em `.webp` (2048² só em
parede/chão de close-up), áudio `.mp3`/`.ogg` (nunca `.wav`), modelo low-poly
`.glb`. Ver [`docs/GITHUB_PAGES.md`](docs/GITHUB_PAGES.md).

---

## Deploy

Push em `main` roda `.github/workflows/deploy.yml`:
`npm ci → smoke → build → publica dist/`. Configurar uma vez em
**Settings → Pages → Source: GitHub Actions**.

O `base` do Vite é `/Granny/` no build e `/` em dev. No CI ele é lido de
`GITHUB_REPOSITORY`, então um rename do repositório não quebra o deploy em
silêncio — e o workflow falha se o `dist/` não estiver no caminho certo.

---

## Documentação

| arquivo | para quem |
| --- | --- |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | entender o código e os contratos entre módulos |
| [`docs/DECISOES.md`](docs/DECISOES.md) | por que cada escolha foi feita, o que foi descartado |
| [`docs/PARTES.md`](docs/PARTES.md) | o que falta das Partes 2–5 e onde entra |
| [`docs/GITHUB_PAGES.md`](docs/GITHUB_PAGES.md) | build, `base`, assets e checklist de deploy |

---

## Licença

MIT.
