# Partes 2–5 —onde cada uma entra

**Status:** só a Parte 1 do design doc foi entregue. A Parte 1 termina
prometendo as Partes 2–5, então este projeto foi montado deixando
**encaixes explícitos** para elas em vez de implementá-las por adivinhação.

Este arquivo é o mapa dos encaixes: o que já está pronto para receber, o que
falta, e o arquivo exato de cada coisa.

- [O que a Parte 1 já deixou pronto](#o-que-a-parte-1-já-deixou-pronto)
- [Parte 2 — casa, colisão e portas](#parte-2--casa-colisão-e-portas)
- [Parte 3 — a Granny (IA)](#parte-3--a-granny-ia)
- [Parte 4 — itens e puzzles](#parte-4--itens-e-puzzles)
- [Parte 5 — UI, áudio e polish](#parte-5--ui-áudio-e-polish)
- [Ordem sugerida de trabalho](#ordem-sugerida-de-trabalho)

---

## O que a Parte 1 já deixou pronto

Verificado por `npm run smoke` (27 testes) e `npm run build`:

| área | estado |
| --- | --- |
| Estrutura de pastas do doc (`/public/{models,textures,audio}`, `/src/{core,player,ai,world,systems,ui}`) | ✅ |
| `base` do Vite batendo com o nome do repo | ✅ |
| Renderer + câmera + loop de passo fixo + três níveis de qualidade | ✅ |
| Máquina de estados com os 7 estados do doc | ✅ |
| Movimento em primeira pessoa com Pointer Lock + WASD | ✅ fatia de validação |
| Colisão manual (AABB + grade) e linha de visão | ✅ |
| Casa procedimental a partir do floor plan (9 cômodos, 8 portas, 1 saída) | ✅ |
| Portas com dobradiça, tranca e colisor de vão | ✅ (falta não fechar em cima do jogador) |
| Ruído posicional (passos, portas, gavetas) + medidor no HUD | ✅ |
| IA da Granny com cone de visão, audição, 4 estados e captura | 🟡 scaffold funcional |
| Inventário com slots limitados | ✅ |
| Puzzle mínimo da fuga (chave mestra + código do cadeado) | ✅ |
| `localStorage` versionado | ✅ |
| Áudio 3D com `PannerNode` + fallback procedural | ✅ |
| HUD e telas em pt-BR | ✅ |
| Deploy automático no Pages | ✅ |

✅ = fechado · 🟡 = funciona, mas é esboço · ⬜ = encaixe reservado

---

## Parte 2 — casa, colisão e portas

Esperado do doc (a publicar): layout detalhado, móveis, portas trancadas,
porão/andar superior?

| o que | onde | já existe |
| --- | --- | --- |
| Novos cômodos / mudar o mapa | `world/floorplan.js` (`MAP_ROWS`, `ROOMS`) | ✅ basta editar o ASCII; o parser normaliza e o smoke confere conectividade |
| Móveis | `world/floorplan.js` → `PROPS` | ✅ altura ≥ 0.45 para bloquear |
| Portas trancadas por chave | `world/Doors.js` (`setLocked`) + `systems/PuzzleSystem.js` | ✅ usado pela porta da frente |
| Porta não fechar em cima do jogador | `Door.toggle()` | ⬜ verificar ocupação do vão antes de fechar |
| Texturas reais de parede/chão | `public/textures/` + `core/manifest.js` | ✅ loader cai no procedural se faltar |
| Modelos `.glb` de móveis | `public/models/` + `core/manifest.js` | ✅ idem |
| Segundo andar / porão | novo nível em `HOUSE` ou segundo `House` | ⬜ colisão é 2D (XZ) — precisa decidir como representar dois pisos |

**Armadilhas já conhecidas** (detalhadas em [DECISOES.md](./DECISOES.md)):

- `cellToWorld` não centraliza o mapa — deslocar a origem exige mexer no
  `CollisionWorld` junto;
- porta cujo vão não alinha com o corredor: depois de editar `MAP_ROWS`, rode
  `npm run smoke` — o teste de conectividade pega;
- `E` e `D` são poupados pelo fechamento automático da borda, os outros
  marcadores não.

## Parte 2 (2/5) — spawn, controles e movimentação ✅

O doc manda: acordar deitado num quarto pequeno e fechado, sem corrida, com
agachar lento/silencioso e interação por raycast curto.

| o que | onde | status |
| --- | --- | --- |
| Fade-in do preto + acordar deitado (olho 0.3 → 1.7 em 0.5s) | `#fadeIn()` + `PlayerController.#updateWake()` | ✅ |
| Quarto inicial 3x3, saída única trancada por `key_room` | `floorplan.js` (`ROOMS.start`, `DOOR_LOCKS`) | ✅ |
| Controles: WASD, mouse, Ctrl agachar, E/clique interagir, Tab/Q, G, Esc | `config.js` → `DEFAULT_BINDINGS` | ✅ |
| Sem corrida, sem salto livre | `PLAYER` (sem `sprintSpeed`) | ✅ |
| Cápsula + raycast de chão a cada frame | `CollisionWorld.groundHeight()` | ✅ |
| Raycast de tábua barulhenta (alimenta a Parte 3) | `CollisionWorld.boardAt()` + `CREAKY_BOARDS` | ✅ |
| FOV 78°, pitch ±85° | `Engine.js`, `PLAYER.maxPitch` | ✅ |
| Mira: POIs **e portas**, prompt "abrir/porta (trancada)" | `Game.#updateFocus()`, `#interactDoor()` | ✅ |
| Crosshair que muda de estado, HUD de capturas, toasts | `ui/HUD.js` | ✅ |
| Salto só em pontos marcados ("vault") | — | ⬜ Parte 3, junto das janelas |

**Armadilhas desta parte** (detalhadas em [DECISOES.md](./DECISOES.md) §16):

- apagar um campo do `PLAYER` quebra silenciosamente outro sistema (já
  aconteceu com `eyeRatio` → `NaN` na IA). Depois de mexer no config, rode
  `npm run smoke`;
- lerp de altura precisa de `span` fixo, senão vira decaimento exponencial e a
  transição nunca termina no tempo prometido;
- `input.endFrame()` tem que ser chamado uma vez por frame, senão `wasPressed`
  repete a ação indefinidamente.

## Parte 3 (3/5) — ruído, jumpscares, cutscene, personagens, tela de título

| item do doc | onde | status |
| --- | --- | --- |
| Sistema de ruído com raio por tipo (§6.2) | `NOISE_RADIUS` + `NoiseSystem` | ✅ |
| Tábuas barulhentas (§6.3) e óleo que silencia (§6.4) | `CollisionWorld.boardAt/silenceBoard`, item `oil` | ✅ |
| Como a IA ouve (§6.5): compara distância × raio, expira em 0.5s | `GrannyAI.#listen()`, `NoiseSystem.update()` | ✅ |
| Itens de distração (§6.6): barulho no ponto de impacto | `Game.#releaseItem()` (`Espaço`) | ✅ |
| Cinco modos de dificuldade + 5 noites + atalhos trancados | `config.DIFFICULTY`, `House.setShortcutsLocked()` | ✅ |
| Granny abre porta em 2s (qualquer modo) | `GrannyAI.#advance()` | ✅ |
| Uma mão só / arremessar / item no void volta para a sala | `Inventory(max:1)`, `Game.#releaseItem()` | ✅ |
| Tilt da câmera conforme as noites perdidas | `PlayerController.setTilt()` | ✅ |
| Som muda por item e por superfície | `AudioSystem.pickup()`, `footstep({surface})` | ✅ |
| Casa mais clara + ajuste de brilho nas opções | `HOUSE.ambient`, `Engine/House.setBrightness()` | ✅ |
| Tela de título (§1) e seleção de dificuldade com 5 modos | `ui/Menus.js` | ⬜ próxima leva |
| Cutscene de abertura (§2): olhar o teto, blur, prompt, gemido | `Game.respawn()` | ⬜ próxima leva |
| Jumpscares (§3): captura, susto roteirizado, aranha | `Game.onCaught()` + novo `ScareSystem` | ⬜ próxima leva |
| Personagens 3D (§4): Granny, Spider, Spider do esgoto, Slendrina | `world/characters/` | ⬜ próxima leva |
| Quintal (backyard) no mapa | `world/floorplan.js` | ⬜ próxima leva |

**Armadilhas desta parte** (detalhadas em [DECISOES.md](./DECISOES.md) §17):

- `PROPS.at` é célula ABSOLUTA e `size` é em METROS (já erramos os dois);
- atalho trancado não pode ser a única porta de um cômodo — o smoke faz BFS
  com os atalhos trancados e pega isso;
- ao remover um campo do config, grep em `src/` e `tools/`: o fantasma de
  `eyeRatio` já custou uma sessão de debug.

## Parte 3 — a Granny (IA)

| o que | onde | já existe |
| --- | --- | --- |
| Patrulha por waypoints / por cômodo | `ai/GrannyAI.js` (`AIState.PATROL`) | ⬜ patrulha ingênua |
| Grafos de navegação por sala | `ai/NavGrid.js` | 🟡 BFS já funciona, falta custo/ área preferida |
| Dificuldade | `core/config.js` → `DIFFICULTY` | ✅ `Game.applyDifficulty()` empurra `sight/chase/hearing` para `granny.scale` |
| Reset entre tentativas | `GrannyAI.reset()` | ⬜ hoje `spawn()` faz esse papel |
| Busca de esconderijos | `GrannyAI` + `world/POI.js` (kind `hiding`) | ⬜ o `concealed` do jogador já é respeitado em `canSee` |
| Reação a armadilhas / barulho do jogador | `systems/NoiseSystem.js` | ✅ `consume()` com raio por loudness |
| Dias / persistência entre capturas | `core/Game.js` (`GAME.totalDays`, `onCaught`) | ⬜ campo reservado |

Contrato que a IA já consome do jogador:
`{ position, height, crouching, concealed }` — nada além disso, o que mantém
`PlayerController` livre para mudar.

## Parte 4 — itens e puzzles

| o que | onde | já existe |
| --- | --- | --- |
| Catálogo de itens | `systems/items.js` (`ITEMS`, `LOOT_POOL`) | ✅ 5 itens |
| Sorteio por run com seed | `PuzzleSystem.beginRun({ itemCount, rng })` | ✅ determinístico (`?seed=`) |
| Regra da fuga | `PuzzleSystem.attemptEscape()` | ✅ `key_hall` + cadeado resolvido |
| POIs de puzzle | `world/POI.js` (`kind: 'puzzle'`) | ⬜ hoje no-op (`PuzzleSystem.open`) |
| Inventário com uso combinado (chave → porta) | `Inventory` + `PuzzleSystem.solve` | 🟡 `solve(id)` resolve por id; falta combinar itens |
| Peso/empilhamento, mochila cheia | `Inventory` | ✅ slots limitados + toast |

Contrato `POI.interact(ctx)`:

```js
ctx = { inventory, puzzles, noise, audio, player, house, bus }
// → { ok, message, noise, sound, escape?, hide? }
```

| `kind` | chama |
| --- | --- |
| `item` | `inventory.add()` + `puzzles.notifyPickup()` |
| `container` | `puzzles.search(poi)` |
| `hiding` | `player.setHidingSpot(poi)` |
| `exit` | `puzzles.attemptEscape(poi)` |
| `puzzle` | ⬜ `puzzles.open(poi)` — a preencher |

## Parte 5 — UI, áudio e polish

| o que | onde | já existe |
| --- | --- | --- |
| Textos | `ui/strings.js` | ✅ tudo centralizado em pt-BR |
| Telas (menu, opções, controles, pausa, fim) | `ui/Menus.js` | ✅ |
| HUD (mira, prompt, objetivo, ruído, corações, compasso, toasts) | `ui/HUD.js` | ✅ |
| Tela de inventário / mapa | `Menus` + atalhos `Tab`/`M` | 🟡 atalhos mostram toast; faltam as telas |
| Rebind de teclas | `core/config.js` → `DEFAULT_BINDINGS`, `InputManager.rebind` | ⬜ falta a tela |
| Áudio posicional real | `audio/AudioSystem.js` + `public/audio/` | ✅ grafo pronto, sons procedurais |
| Música de tensão dinâmica | `AudioSystem.setTension()` | 🟡 hook existe, falta o conteúdo |
| Interpolação de render | `Engine.onRender(dt, alpha)` | ⬜ `alpha` exposto e não usado |
| Acessibilidade / reduced motion | `styles/main.css` | ✅ |
| Mobile | `styles/main.css` | 🟡 layout se adapta; sem controles touch |

## Ordem sugerida de trabalho

1. **Parte 2** — a casa é o palco de todo o resto; muda colisão, LOS e IA.
2. **Parte 4** — puzzles definem o que o jogador faz; a IA só precisa reagir.
3. **Parte 3** — afinar a perseguição com o nível já jogável é mais fácil.
4. **Parte 5** — polish depois que a run inteira existe.

A cada passo: `npm run smoke && npm run build && npm run preview` (ver
[GITHUB_PAGES.md §6](./GITHUB_PAGES.md#6-checklist-antes-de-commitar)).
