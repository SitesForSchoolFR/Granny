# Arquitetura — Escape House

Como o código está dividido, quem conversa com quem, e em que ordem as coisas
acontecem. Escrito para quem vai implementar as Partes 2–5: cada seção diz
onde o seu código entra.

Conteúdo:

1. [Visão geral](#1-visão-geral)
2. [Árvore de arquivos](#2-árvore-de-arquivos)
3. [Ciclo de vida de um frame](#3-ciclo-de-vida-de-um-frame)
4. [Módulo a módulo](#4-módulo-a-módulo)
5. [Contratos entre módulos](#5-contratos-entre-módulos)
6. [Espaço de coordenadas e grid](#6-espaço-de-coordenadas-e-grid)
7. [Estado, eventos e save](#7-estado-eventos-e-save)
8. [Assets e degradação graciosa](#8-assets-e-degradação-graciosa)
9. [Testes](#9-testes)
10. [Onde entra o seu código](#10-onde-enta-o-seu-código)

---

## 1. Visão geral

Quatro ideias sustentam tudo:

- **Um só orquestrador.** `Game.js` é o único lugar que conhece todos os
  subsistemas. Os subsistemas não se conhecem entre si — recebem o que
  precisam por construtor ou por argumento. Isso mantém cada Parte
  implementável isoladamente.
- **Tick fixo, render livre.** `Engine.js` acumula tempo e chama
  `onFixedUpdate(dt)` em passos de `GAME.fixedDt` (1/60 s). Física, IA e ruído
  rodam ali; a câmera/render roda em `onRender(dt, alpha)`. Resultado: a
  perseguição é determinística em qualquer monitor.
- **Tuning centralizado.** Nenhum número mágico fora de `src/core/config.js`.
  Se um valor de gameplay importa, ele mora lá e é congelado (`Object.freeze`).
- **Assets são opcionais.** Sem `.glb`, sem `.png`, sem `.ogg`, o jogo roda do
  mesmo jeito com geometria, texturas e áudio procedurais. Nenhum `load()`
  rejeita — no máximo avisa no console. Ver [§8](#8-assets-e-degradação-graciosa).

Fluxo de dados num frame:

```
InputManager ──► PlayerController ──► CollisionWorld (resolve)
                        │                    ▲
                        ├─► NoiseSystem.emit │
                        │                    │
                  GrannyAI ── consume() ─────┘
                        │
                        └─► 'granny:catch' ──► Game.onCaught() ──► state machine
```

## 2. Árvore de arquivos

```
index.html                 canvas + #hud + #screens + #loading, favicon inline
vite.config.js             base '/Granny/' no build, '/' em dev
package.json               scripts: dev | build | preview | smoke | check | vendor:draco

public/                    copiado literalmente para a raiz do site
  models/  textures/  audio/     ← assets, todos opcionais
  vendor/draco/                  ← gerado por `npm run vendor:draco`, no .gitignore

src/
  main.js                  WebGL check → window.game = new Game() → boot()
  core/
    config.js              TODOS os números de tuning (congelados)
    events.js              EventBus + nomes de evento (Ev)
    state.js               GameState (7), StateMachine, Countdown
    Engine.js              renderer/camera/cena, loop de passo fixo, qualidade
    procedural.js          texturas desenhadas em <canvas> (parede, chão, madeira)
    manifest.js            lista de assets declarados; nada é obrigatório
    AssetLoader.js         carrega o que existir, cai no procedural se faltar
    Game.js                orquestrador
  world/
    floorplan.js           o mapa em ASCII + ROOMS + POI_SLOTS + PROPS
    CollisionWorld.js      AABBs + hash espacial + linha de visão
    Doors.js               porta com dobradiça, tranca e colisor de vão
    House.js               constrói a cena a partir do floorplan
    POI.js                 pontos de interação (item/container/hiding/puzzle/exit)
  player/
    InputManager.js        Pointer Lock + teclado por código de tecla
    PlayerController.js    movimento, postura, passos, ruído, esconderijo
    Inventory.js           slots limitados + toasts
  ai/
    NavGrid.js             grafo de navegação (BFS) derivado do piso
    GrannyAI.js            PATROL / INVESTIGATE / CHASE / SEARCH
  systems/
    NoiseSystem.js         emissão e consumo de ruído
    PuzzleSystem.js        progresso, sorteio de itens, regra de fuga
    SaveSystem.js          localStorage versionado
    items.js               catálogo de itens
  audio/
    AudioSystem.js         Web Audio, PannerNode 3D, áudio procedural
  ui/
    strings.js             TODO o texto em pt-BR
    HUD.js                 DOM puro (sem canvas 2D): crosshair, prompt, objetivo…
    Menus.js               telas MENU/OPÇÕES/PAUSA/CAUGHT/WIN/LOSE
  styles/main.css          linguagem visual

tools/
  smoke.mjs                25 testes headless (npm run smoke)
  vendor-draco.mjs         copia o decoder Draco para public/vendor/draco

.github/workflows/deploy.yml   npm ci → smoke → build → Pages
```

## 3. Ciclo de vida de um frame

`Engine.start()` → `requestAnimationFrame`:

```
dt = min(realDt, 0.25)              // trava anti-explosão ao voltar de aba oculta
accumulator += dt
while (accumulator >= fixedDt && steps < maxSubSteps) { onFixedUpdate(fixedDt); accumulator -= fixedDt }
alpha = accumulator / fixedDt
onRender(dt, alpha)
```

`Game.onFixedUpdate(dt)`:

1. `input.beginFrame? / player.update(dt, input, world)` — move, resolve
   colisão, emite passos.
2. `noise.update(dt)` — decai o medidor do HUD.
3. `granny.update(dt, player)` — consome ruído, decide estado, persegue.
4. `doors.forEach(d => d.update(dt))` — anima o giro das portas.
5. `house.update(dt, elapsed)` — lamparinas cintilantes.
6. contadores: `runSeconds`, `catchCooldown`.

`Game.onRender(dt)`:

1. câmera ← `player.eye` + yaw/pitch + head bob;
2. `audio.syncListener(camera)` — para os `PannerNode`s;
3. `#updateFocus()` — qual POI está sob a mira (alcance + cone + LOS);
4. `hud.renderFrame({ danger, noiseMeter, lastNoiseAngle, debugText })`;
5. `engine.render()`.

A máquina de estados (não o loop) decide **o que** rodea: em `PAUSED` o loop
continua (para a cena não congelar visualmente) mas `simulate()` não é chamado.

## 4. Módulo a módulo

### `core/config.js`

Objetos congelados: `GAME`, `PLAYER`, `GRANNY`, `HOUSE`, `AUDIO`, `NOISE`,
`QUALITY`, `DIFFICULTY`, `SAVE`, `DEFAULT_BINDINGS`. Unidades: metros,
segundos, radianos. `DIFFICULTY` expõe `grannySightScale / grannyChaseScale /
hearingScale / itemCount / maxCaught`; `Game.applyDifficulty()` (chamada no
`startRun` e ao trocar a dificuldade no menu) empurra os três primeiros para
`granny.scale` — é o único ponto de contato entre dificuldade e IA.

### `core/Engine.js`

Cria `WebGLRenderer` (antialias desligado, `powerPreference: high-performance`),
cena com `FogExp2` e câmera `PerspectiveCamera(72°)`. `setQuality(name)`
aplica `QUALITY[name]` (pixel ratio, sombras, mapa de sombra). Redimensiona com
`ResizeObserver`. `document.hidden` pausa a acumulação para não "devolver" um
salto de tempo ao voltar. `dispose()` libera GPU — chamado se o jogo for
reiniciado.

### `core/state.js`

```js
GameState = { MENU, LOADING, PLAYING, CAUGHT, WIN, LOSE, PAUSED }
```

`StateMachine` guarda transições permitidas (`can()`) e **trava reentrada**
(`go()` dentro de um handler é ignorado, evitando loops `CAUGHT → CAUGHT`).
`Countdown` é um timer simples usado para cooldowns.

### `world/floorplan.js`

O mapa é texto. `#` parede, `.` chão, `D` porta, `E` porta de saída, `1`–`7`
pontos de interação, `S` spawn do jogador, `G` spawn da Granny. O parser
normaliza larguras, fecha a borda (preservando `D`/`E`) e acusa linha torta.

```
'#####################'
'#.........#.........#'
'#....1....#....2....#'      quarto (x 1-10)   |  escritório (x 11-20)
'#.........#.........#'
'###D###########D#####'
'#...................#'
'#..S..........G.....#'      corredor: spawn jogador (3,6), Granny (14,6)
'###D#######D#####D###'
'#.........#.........#'
...
```

`ROOMS` (9 divisões), `POI_SLOTS` (o que cada marcador significa) e `PROPS`
(móveis: célula, tamanho, altura). **Móvel com altura < 0.45 m é "stepável"
pelo jogador** (`PLAYER.stepHeight = 0.24`) — se a ideia é bloquear, use
≥ 0.45.

### `world/CollisionWorld.js`

Caixas AABB indexadas num hash espacial por célula (`cell = HOUSE.cell`).
API usada pelo resto do jogo:

| método | para que serve |
| --- | --- |
| `addBox(box)` / `setBoxEnabled` | registrar/desligar colisor (porta usa) |
| `markSolid(cx, cz)` | parede do grid (feito por `House`) |
| `isCellSolid(cx, cz)` | **fora dos limites = sólido** (vazio é parede) |
| `isBlocked(x, z, r)` | círculo do corpo colide? |
| `resolveCircle(pos, r, stepHeight)` | empurra para fora; devolve posição válida |
| `hasLineOfSight(a, b)` | amostragem entre dois pontos — visão da IA e foco do HUD |
| `groundHeight(x, z)` | piso no ponto |
| `nearestFree(x, z)` | célula caminhável mais próxima (IA despresa) |

`isBlocked` e `groundHeight` chamam `rebuild()` antes de consultar: sem isso um
colisor recém-registrado (porta fechada) não aparece no hash.

### `world/Doors.js`

`Door` é um grupo posicionado na **dobradiça**, com painel deslocado meia
largura — girar o grupo gira a porta em torno da quina, não do centro do vão.
`toggle()` devolve `{ ok, open, loudness, reason }`; o colisor do vão só existe
enquanto a porta está fechada (`setBoxEnabled`). `setLocked(bool)` é o que o
`PuzzleSystem` chama ao resolver o cadeado.

> **Lacuna conhecida:** `toggle()` não verifica se o jogador está no vão —
> fechar a porta em cima dele apenas o empurra na resolução seguinte. Parte 2.

### `world/House.js`

Transforma o floorplan em cena:

```
#materials → #doors → #floorAndCeiling → #walls → #props → #spawnsAndPois → #lights
```

A ordem importa: `#doors` reescreve `D`/`E` para `.` **antes** de `#walls`
erguer as paredes, senão o vão nasce tampado.

- Paredes: um único `InstancedMesh` de painéis por face (só funciona porque
  todos os painéis têm o mesmo tamanho).
- Chão/teto: `PlaneGeometry` com repeat de textura.
- `cellToWorld(cx, cz) = ((cx + 0.5) * cell, (cz + 0.5) * cell)` — **sem
  centralizar**, para que grid visual e grid de colisão compartilhem índices.
- Varanda alinhada ao `x` da saída (`exits[0].world.x`).
- Lâmpadas cintilantes em `#lights`, `attachPlayerLight()` para a lanterna.

### `world/POI.js`

`kind`: `item` | `container` | `hiding` | `puzzle` | `exit`. `isFocused(view)`
combina alcance (`PLAYER.interactRange`), cone (`interactConeDot`) e LOS.
`interact(ctx)` devolve `{ ok, message, noise, sound, escape?, hide? }` e é o
único ponto em que apertar `E` faz algo — ver [§5](#5-contratos-entre-módulos).

### `player/PlayerController.js`

Move com aceleração + amortecimento, colide por círculo, sobe degraus ≤
`stepHeight`. Posturas: `walk` / `crouch` / `sprint` / `hide`, expostas em
`get stance()` (o HUD escuta `Ev.PLAYER_STANCE`). Emite passos: a cada
`distanceSinceStep` metros, chama `audio.footstep(...)` e
`noise.emit({ position, loudness, type })` com o valor de `PLAYER.noise`
correspondente. `setHidingSpot(poi)` **não teleporta**: se o jogador estiver a
mais de `PLAYER.hideRadius` (1.2 m) do ponto, encosta-o até 85% desse raio e
trava o movimento ali; `E` sai. `concealed` só é `true` dentro do raio, então
"encostar na mesa" não conta como escondido. Esconderijo precisa ficar numa
célula **sem** móvel: o ponto do POI é o centro da célula, e um colisor ali
empurraria o jogador para fora ao esconder.

### `player/InputManager.js`

Pointer Lock nativo + bind por `event.code` (funciona em teclado não-US).
`requestLock()` devolve uma Promise; após `Esc` o Chrome recusa um novo lock
por ~1 s, por isso `Game` também religa no **clique do canvas**. `endFrame()`
limpa os presses "desta frame" — tem que ser chamado depois de todo mundo ler.

### `ai/NavGrid.js` + `ai/GrannyAI.js`

`NavGrid` é um grafo de células caminháveis com BFS (nós carregam
`world {x, z}` e um hook `blockedDoorAt`). `GrannyAI` tem quatro estados:

| estado | entra quando | velocidade |
| --- | --- | --- |
| `PATROL` | padrão | `patrolSpeed` |
| `INVESTIGATE` | ouviu ruído / viu de relance | `investigateSpeed` |
| `CHASE` | linha de visão confirmada | `chaseSpeed` |
| `SEARCH` | perdeu o jogador (`loseInterestTime`) | `investigateSpeed` |

`canSee()` = distância + FOV + LOS, com `crouchVisibilityScale` reduzindo o
alcance quando o jogador está agachado. Jogador `concealed` é invisível — a
menos que ela chegue a `GRANNY.concealSafeDistance` (1.6 m), caso em que o
esconderijo vira armadilha em vez de escudo. `#listen()` consome a fila do
`NoiseSystem`. `catchDistance` dispara `Ev.GRANNY_CATCH`. `debugLines(scene)`
desenha o caminho quando `?debug`.

> **Parte 3:** `GrannyAI` é um scaffold funcional (patrulha ingênua, sem
> waypoints por cômodo) e não tem `reset()`. `scale` já vem de `DIFFICULTY`
> via `Game.applyDifficulty()`.

### `systems/NoiseSystem.js`

Produtor/consumidor de uma fila: jogador e portas dão `emit({ position,
loudness, type, source })`; a IA chama `consume(listener)` e **esvazia** a fila
— então nunca assine um `emit` com um push, ou o mesmo ruído é ouvido duas
vezes. `update(dt)` move o medidor do HUD.

### `systems/PuzzleSystem.js`

Regra de fuga implementada:

```
escapeReady() = inventário tem 'key_hall'  &&  puzzle 'padlock' resolvido
```

`beginRun({ pois, itemCount, exitLocked })` sorteia o loot **apenas** em slots
`container`/`item` (usando o seed da run, então `?seed=123` é reproduzível) e
sincroniza `slot.item/label`. `attemptEscape(poi)` recusa com
`'trancada — falta a chave mestra'` ou `'o cadeado exige o código do bilhete'`,
ou resolve o cadeado, destranca e abre a porta.

### `audio/AudioSystem.js`

`ensureContext()` cria o grafo (master → sfx/ambience) e os buffers
procedurais; `resume()` fica para o primeiro gesto do usuário (política de
autoplay). `play(name, { position })` cria um `PannerNode` HRTF por disparo.
`syncListener(camera)` atualiza posição/orientação do ouvinte.

### `ui/HUD.js` e `ui/Menus.js`

Só DOM — nada de canvas 2D por cima do WebGL. O HUD recebe
`renderFrame({ danger, noiseMeter, lastNoiseAngle, debugText })` uma vez por
frame e escreve em elementos já existentes. `Menus` renderiza as telas a
partir de `[data-action]` e devolve a ação por callback (`onAction`).

## 5. Contratos entre módulos

**`POI.interact(ctx)`** recebe `{ inventory, puzzles, noise, audio, player,
house, bus }` e devolve `{ ok, message?, noise?, sound?, escape?, hide? }`:

| `kind` | o que chama | resultado |
| --- | --- | --- |
| `item` | `inventory.add(item)` + `puzzles.notifyPickup(item, id)` | ok pega, ou "mochila cheia" |
| `container` | `puzzles.search(poi)` | `{ found: {item,label} } \| null` |
| `hiding` | `player.setHidingSpot(poi)` | `hide: true` |
| `exit` | `puzzles.attemptEscape(poi)` | `escape: true` (Game → `WIN`) |
| `puzzle` | a definir na Parte 4 | — |

**`PuzzleSystem` → HUD:** `progress()` → `{ done, total, ratio, objectives: [{ id, label, ok }] }`.

**`House` → todo mundo:** `house.world` (CollisionWorld), `house.doors`,
`house.pois`, `house.exits = [{ door, cell, world }]`, `house.spawn = { player,
granny }`, `house.cellToWorld/worldToCell/center/roomAt/describe/update`.

**Eventos** (`core/events.js`): `Ev` tem os nomes canônicos; os emitidos hoje
são `ui:toast`, `player:damaged`, `granny:catch`, `inventory:changed`,
`item:taken`, `input:lockchange`, `input:pressed`, `player:stance`.

## 6. Espaço de coordenadas e grid

- `+X` leste, `+Z` sul, `+Y` cima; yaw 0 olha para `-Z`.
- Célula de 3 m (`HOUSE.cell`). `cellToWorld(cx, cz)` devolve o **centro** da
  célula; `worldToCell` é o inverso por `floor`.
- **Não centralize o mapa.** `CollisionWorld` indexa por
  `floor(x / cellSize)`; qualquer deslocamento global do mundo exige um offset
  correspondente lá — já causou um bug de LOS atravessando parede.
- Spawn do jogador: célula (3, 6). Granny: (14, 6). Saída: (11, 15) + varanda
  (11–12, 15–16).

## 7. Estado, eventos e save

Sete estados, com transições declaradas em `state.js`. Regras que já valem:

- `MENU → LOADING → PLAYING`
- `PLAYING ⇄ PAUSED`, `PLAYING → CAUGHT → PLAYING` (enquanto houver tentativas)
- `PLAYING → WIN` (fuga) e `PLAYING/CAUGHT → LOSE` (tentativas esgotadas)

`SaveSystem` grava em `localStorage['escape-house:save']` com
`schemaVersion`. Schema diferente do esperado = save descartado (não migra).
`localStorage` indisponível (modo privado, `file://`) não quebra: `available`
fica `false` e nada é chamado.

Parâmetros de URL aceitos: `?debug` (overlay), `?seed=` (run determinística),
`?quality=low|medium|high`, `?diff=easy|normal|nightmare`.

## 8. Assets e degradação graciosa

`core/manifest.js` declara o que **poderia** existir em `public/`.
`AssetLoader` tenta carregar e, falhando, avisa no console e usa o substituto
procedural. Consequência prática: o repositório roda clonado, sem binários.

| tipo | se existir | se faltar |
| --- | --- | --- |
| textura | arquivo em `public/textures/` | `core/procedural.js` desenha em `<canvas>` |
| modelo `.glb` | `GLTFLoader` | placeholder/primitiva |
| som | arquivo em `public/audio/` | buffer sintetizado no `AudioContext` |

**Draco:** só é ligado se algum modelo do manifesto declarar `draco: true`.
Nesse caso rode `npm run vendor:draco` (copia o decoder para
`public/vendor/draco/`, que está no `.gitignore`) — caso contrário nenhum byte
de Draco é baixado.

Regras de tamanho (limite do Pages): texturas ≤ 1024² (2048² só em
parede/chão de close-up) em `.webp`; áudio `.mp3`/`.ogg`, nunca `.wav`;
modelos low-poly `.glb`.

## 9. Testes

`npm run smoke` roda `tools/smoke.mjs`: 27 testes headless, sem navegador nem
jsdom, cobrindo

- **floor plan (6)** — integridade do grid, conectividade (todo POI alcançável
  a partir do spawn), portas alinhadas com os vãos, marcadores duplicados;
- **colisão (3)** — contenção da borda (inclui o vazio depois da porta da
  frente aberta), remoção do colisor ao abrir, linha de visão;
- **ruído + IA (8)** — atenuação, consumo da fila, investigate, perseguição,
  captura, agachar reduz visão, escondido invisível de longe / descoberto de
  perto;
- **puzzles (3)** — fuga pela POI de saída, recusa sem chave/código,
  determinismo do sorteio com seed;
- **jogador (3)** — passos ao longo do corredor, agachar (distância e ruído),
  não travar na parede, esconderijo (não teleporta, trava o movimento, só
  oculta dentro do raio);
- **estado + save (4)** — transições, round-trip, descarte de schema antigo,
  `localStorage` ausente.

O CI (`.github/workflows/deploy.yml`) roda `npm ci → npm run smoke → npm run
build` e só então publica. **Sempre** `npm run build && npm run preview` antes
de dizer que terminou.

## 10. Onde entra o seu código

| Parte | Arquivos que você vai tocar |
| --- | --- |
| 2 — casa, colisão, portas | `world/House.js`, `world/Doors.js`, `world/floorplan.js`, `core/manifest.js` |
| 3 — IA da Granny | `ai/GrannyAI.js`, `ai/NavGrid.js`, `core/config.js` (`GRANNY`) |
| 4 — puzzles e itens | `systems/PuzzleSystem.js`, `systems/items.js`, `world/POI.js`, `world/floorplan.js` |
| 5 — UI, áudio, polish | `ui/HUD.js`, `ui/Menus.js`, `ui/strings.js`, `audio/AudioSystem.js`, `styles/main.css` |

Detalhamento parte a parte: [PARTES.md](./PARTES.md).
Racional das escolhas: [DECISOES.md](./DECISOES.md).
Deploy: [GITHUB_PAGES.md](./GITHUB_PAGES.md).
