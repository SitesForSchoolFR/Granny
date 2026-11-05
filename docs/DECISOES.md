# Decisões — Escape House

Por que cada escolha da Parte 1 foi feita, o que foi descartado e o que ainda
está em aberto. Serve para a Parte 2 não relitar o que já foi decidido — e
para saber onde uma decisão pode ser revertida sem dor.

Sumário:

1. [Sem engine de física: colisão manual por AABB](#1-sem-engine-de-física-colisão-manual-por-aabb)
2. [Casa em grade ASCII, não .glb](#2-casa-em-grade-ascii-não-glb)
3. [Tick fixo, render livre](#3-tick-fixo-render-livre)
4. [Máquina de estados com reentrada travada](#4-máquina-de-estados-com-reentrada-travada)
5. [Todo asset é opcional](#5-todo-asset-é-opcional)
6. [HUD em DOM, não em canvas 2D](#6-hud-em-dom-não-em-canvas-2d)
7. [Pointer Lock nativo](#7-pointer-lock-nativo)
8. [Áudio: Web Audio puro, PannerNode, procedural](#8-áudio-web-audio-puro-pannernode-procedural)
9. [Draco só quando pedido](#9-draco-só-quando-pedido)
10. [Tuning congelado em config.js](#10-tuning-congelado-em-configjs)
11. [Testes headless em vez de runner de navegador](#11-testes-headless-em-vez-de-runner-de-navegador)
12. [Ruído: fila produtor/consumidor](#12-ruído-fila-produtorconsumidor)
13. [Esconderijo: encostar, não teleportar](#13-esconderijo-encostar-não-teleportar)
14. [Aberturas e lacunas conhecidas](#14-aberturas-e-lacunas-conhecidas)

---

## 1. Sem engine de física: colisão manual por AABB

**Decisão:** `world/CollisionWorld.js` — AABBs + hash espacial por célula,
resolução por eixo de menor penetração. Sem cannon-es.

**Por quê:** o cenário é uma casa estática. Não há corpo dinâmico, empilhamento,
junta ou ragdoll — nada do que justifica uma engine. O doc da Parte 1 abriu a
porta explicitamente ("cannon-es **ou** colisão manual por raycast"), e o
critério de tamanho do Pages (repo muito abaixo de 1 GB, mas bundle pequeno
para carregar rápido) decidiu: ~40 kB gzip a menos.

**Custo:** não há rampa, escada, queda de objeto, porta empurrável com
inércia. Se a Parte 4 precisar disso, o ponto de troca é
`CollisionWorld.resolveCircle` — a assinatura já é a de um "mover e resolver".

**Armadilha já paga:** `resolveCircle` trata como degrau qualquer caixa cujo
topo esteja até `stepHeight` (0.24 m) acima dos pés. Móvel que deve bloquear
precisa de **altura ≥ 0.45 m**.

## 2. Casa em grade ASCII, não .glb

**Decisão:** o mapa é texto (`world/floorplan.js`). A cena é gerada em runtime.

**Por quê:**

- colisão e linha de visão viram lookup O(1) numa grade, sem broadphase;
- level design é revisável em diff — um PR mexe num caractere e a revisão
  entende;
- **zero bytes baixados**. Uma `.glb` da casa seria o maior asset do jogo e o
  Pages cobra isso no primeiro load.

**Custo:** a casa é ortogonal. Nada de parede diagonal ou sala curva. Reverter
significaria reescrever `House.build()` e alimentar o `CollisionWorld` a partir
da malha — possível, mas é trabalho da Parte 2 inteira.

**Por que deu trabalho:** o grid visual e o grid de colisão compartilham
índices, então **`cellToWorld` não centraliza o mapa**. Uma versão anterior
centralizava e todo `markSolid` caía na célula errada (LOS atravessando
parede). Se algum dia o mapa precisar de origem deslocada, o offset tem que
ser aplicado nos dois lados.

## 3. Tick fixo, render livre

**Decisão:** `Engine` acumula tempo e emite `onFixedUpdate(1/60)` N vezes,
depois `onRender(dt, alpha)`, com `maxSubSteps` para não espiralar.

**Por quê:** a perseguição tem que ser igual num monitor de 60 Hz e num de
144 Hz; e o determinismo (`?seed=`) só existe se o passo for constante.

**Interpolação:** ainda não implementada — a câmera lê a posição do último
passo fixo. Com passo de 1/60 e render típico acima disso, o jitter é
imperceptível; se incomodar, `alpha` já está disponível em `onRender`.

## 4. Máquina de estados com reentrada travada

**Decisão:** `StateMachine` com transições declaradas e `go()` ignorado dentro
de um handler.

**Por quê:** o caso real que motivou: `onCaught()` decrementa tentativas e faz
`go(CAUGHT)`; o handler de `CAUGHT` também chama `respawn()`, que faz
`go(PLAYING)`. Sem a trava, um único `go()` disparando handler que chama `go()`
empilha transições e o HUD pisca. A trava torna a transição atômica.

`LOSE` é terminal: `go()` para qualquer coisa a partir dele é recusado.

## 5. Todo asset é opcional

**Decisão:** `core/manifest.js` declara o que *poderia* existir; `AssetLoader`
tenta, e falhando avisa no console e usa o substituto procedural (textura
desenhada em `<canvas>`, primitiva no lugar do modelo, buffer sintetizado no
`AudioContext`).

**Por quê:**

- o repositório clonado roda sem binário nenhum — ninguém precisa fazer
  download de 200 MB para dar `npm run dev`;
- o Pages nunca quebra por conta de um asset que esqueceram de commitar;
- permite evoluir arte sem travar código.

**Regra prática:** nunca escreva `await load().catch(err => fatal(err))`. O
loader não rejeita; se você transformar o aviso em erro, mata a degradação.

## 6. HUD em DOM, não em canvas 2D

**Decisão:** `ui/HUD.js` escreve em elementos HTML já existentes, uma vez por
frame.

**Por quê:** texto nítido em qualquer DPI, acessível a leitor de tela,
estilizável em CSS (`prefers-reduced-motion`, contraste) e sem um segundo
contexto de desenho disputando GPU com o WebGL.

**Custo:** dezenas de pequenos writes de layout por frame. Mitigado porque o
HUD escreve **string e estilo, nunca layout de leitura** — nada de
`getBoundingClientRect()` no loop (isso forçaria reflow síncrono).

## 7. Pointer Lock nativo

**Decisão:** Pointer Lock API pura, com bind por `event.code`.

**Por quê:** `event.code` é a posição física da tecla, então WASD funciona em
ABNT2, Dvorak, etc. Com `event.key`, `KeyW` num teclado francês vira `Z`.

**Armadilha do Chrome:** depois de `Esc`, o navegador recusa
`requestPointerLock()` por cerca de 1 s (proteção contra lock involuntário).
Como voltar ao jogo costuma ser um clique, `Game` também tenta religar no
**clique do canvas** — um clique é sempre um gesto válido.

## 8. Áudio: Web Audio puro, PannerNode, procedural

**Decisão:** `AudioSystem` com grafo `master → sfx/ambience`, um `PannerNode`
HRTF por disparo posicional e buffers sintetizados quando falta arquivo.
`ensureContext()` (cria o grafo, suspenso) é separado de `resume()` (só depois
do primeiro gesto).

**Por quê:** política de autoplay — criar o `AudioContext` antes de um gesto do
usuário deixa ele suspenso em todo navegador. Separar as duas fases faz o jogo
não estourar no boot e não perder o primeiro som.

**Custo:** sintetizar passos/rangidos é convincente o bastante para placeholder
e fraco para entrega final — a Parte 5 troca por arquivos sem mudar a API
(`play(name, { position })`).

## 9. Draco só quando pedido

**Decisão:** o `DRACOLoader` só é ligado se algum modelo do manifesto declarar
`draco: true`; o decoder é copiado para `public/vendor/draco/` por
`npm run vendor:draco` (e está no `.gitignore`).

**Por quê:** o decoder são ~745 kB que **ninguém** deveria baixar enquanto não
existe um modelo comprimido. E referenciar o decoder dentro de
`node_modules/three` via `new URL(..., import.meta.url)` quebra a resolução de
`exports` do Vite 8 — daí o vendor self-hosted.

## 10. Tuning congelado em config.js

**Decisão:** todos os números de gameplay em `core/config.js`, objetos
`Object.freeze`.

**Por quê:** balancear terror é mexer em 30 números ao mesmo tempo; tê-los
espalhados torna impossível achar a combinação. Congelar impede mutação acidental
em runtime (um `PLAYER.walkSpeed = 9` esquecido num debug sobrevive a um
`restart`).

**Consequência:** para experimentar valores sem editar o arquivo, use os
parâmetros de URL (`?debug`, `?seed`, `?quality`, `?diff`) ou, em último caso,
uma cópia local do config — nunca mute.

## 11. Testes headless em vez de runner de navegador

**Decisão:** `tools/smoke.mjs`, ~27 asserções em Node puro, sem jsdom nem
Puppeteer.

**Por quê:**

- roda no CI em segundos, sem baixar browser (~300 MB);
- as partes que quebram de verdade são **lógicas**: grid desconectado, porta
  fora do vão, LOS atravessando parede, sorteio de itens não determinístico,
  save corrompido. Nada disso precisa de GPU;
- o que o teste não pega (render, som, Pointer Lock) é exatamente o que o
  humano valida em 30 s de `npm run dev`.

**O que os testes garantem de fato:** ver [ARQUITETURA.md §9](./ARQUITETURA.md#9-testes).

## 12. Ruído: fila produtor/consumidor

**Decisão:** jogador e portas chamam `NoiseSystem.emit(...)`; a IA chama
`consume(listener)`, que **esvazia** a fila.

**Por quê:** ruído é um evento que deve ser ouvido por exatamente um ouvinte,
uma vez. Um `EventBus` com vários assinantes faria a Granny ouvir o mesmo passo
duas vezes — ou nenhuma, se o emissor e o ouvinte rodassem em fases diferentes
do tick.

**Armadilha:** não assine `emit` com um `push` para a IA. A IA puxa com
`consume()` no `update` dela.

## 13. Esconderijo: encostar, não teleportar

**Decisão:** `setHidingSpot()` mantém o jogador onde está e o encosta até 85%
de `PLAYER.hideRadius` (1.2 m) do ponto; `concealed` só vale dentro desse raio.

**Por quê:** a primeira versão teleportava para o ponto do POI — que fica no
centro da célula, ou seja, **dentro** do colisor do móvel. Resultado: a
resolução de colisão cuspia o jogador para fora na frame seguinte. Encostar
até a borda mantém a ficção ("meti a cara atrás do móvel") sem brigar com a
física.

**Consequência para level design:** esconderijo só em célula **sem** móvel.
O marcador `6` do floor plan está na despensa por isso.

**Balanceamento:** `concealed` deixa o jogador invisível à Granny, exceto a
`GRANNY.concealSafeDistance` (1.6 m) — esconderijo bom é abrigo, não escudo
absoluto.

## 14. Duas armadilhas que só aparecem em produção

Registrado porque custaram um deploy cada uma, e nenhuma das duas é visível em
`npm run dev`.

**a) `node.hidden = true` não esconde nada quando o CSS declara `display`.**
A folha do navegador diz `[hidden] { display: none }`, mas **qualquer regra de
autor com `display` ganha dela**. Como `.loading` é `display: grid`, a tela de
loading continuava lá depois de escondida — por cima do menu, com o texto
"acordando…" intacto. Sintoma: parece que o boot travou; na verdade o jogo
tinha terminado. Correção: `[hidden] { display: none !important }` no CSS e
`hideLoading()` remove o nó do DOM.

**b) Erro no construtor não cai em `catch`.**
`new Game()` cria o `WebGLRenderer`. Se isso estoura, o erro acontece **antes**
de existir promise — `boot().catch(fatal)` nunca é alcançado e o jogo fica
preso no loading sem mensagem nenhuma. Em desktop a pessoa abre o console; num
console de videogame, não existe console. Correção: `new Game()` dentro de
`try/catch`, handlers globais de `error` e `unhandledrejection`, o renderer
com escada de opções (de `high-performance` até `low-power`), e etapas do boot
marcadas em `window.__escapeHouse.stage` que o vigia inline mostra na tela.

Consequência prática: **todo caminho de falha tem que terminar em pixels**. Se
um erro só aparece no console, ele não existe para quem joga no sofá.

**c) WebGL não pode ser porteiro.**
A checagem de WebGL bloqueava o boot com uma tela de erro. Em console/TV/PC
antigo isso significa "não joga", mesmo dando para jogar: o jogo é uma
simulação sobre uma grade, e a grade **desenha em 2D** (`ui/FallbackView.js`).
Agora `hasWebGL()` só avisa; sem contexto 3D o `Engine` fica `headless`
(sem `renderer.render`, loop por rAF) e o jogo segue em vista de cima — com
HUD, áudio, furtividade e fuga intactos.

## 15. Aberturas e lacunas conhecidas

Registrado para ninguém achar que é bug silencioso:

| lacuna | onde | quem resolve |
| --- | --- | --- |
| `Door.toggle()` não cancela se o vão estiver ocupado — a porta fecha "atravessando" o jogador, que é empurrado pela resolução | `world/Doors.js` | Parte 5 (polish) |
| Salto só em pontos marcados ("vault") — não existe lugar nenhum no mapa ainda | `world/floorplan.js`, `player/PlayerController.js` | Parte 3 (junto do porão/janelas) |
| Boot tem etapas marcadas, mas nenhuma barra de progresso real (manifesto vazio = 0 assets) | `core/Game.js`, `core/AssetLoader.js` | quando existir arte de verdade |
| `GrannyAI` patrulha sem waypoints por cômodo e não tem `reset()` | `ai/GrannyAI.js` | Parte 3 |
| Interpolação de render (`alpha`) não usada | `core/Engine.js` | Parte 5 (polish) |
| Puzzles além do cadeado da saída (`kind: 'puzzle'`) são no-op | `systems/PuzzleSystem.js`, `world/POI.js` | Parte 4 |
| `Tab`/`M` mostram um toast (inventário / cômodo atual) em vez de telas dedicadas | `core/Game.js`, `ui/Menus.js` | Parte 5 |
| Rebind de teclas — `DEFAULT_BINDINGS` existe, a tela não | `ui/Menus.js`, `core/config.js` | Parte 5 |


## 16. Parte 2 — spawn, controles e movimentação

**a) Sem corrida, de propósito.** `PLAYER.sprintSpeed` e o binding `Shift`
saíram do código (e o smoke falha se voltarem). O design troca *destreza* por
*risco*: 3 m/s andando contra 1,2 m/s agachado, e a diferença real é o ruído
(0.42 contra 0.10). O jogador não perde por ser lento no teclado, perde por
escolher mal.

**b) Acordar deitado.** A run começa com a câmera a 0.3 m, fade-in do preto e
~1,5 s sem controle; o primeiro input de movimento dispara a levantada de
0,5 s. Isso dá tempo de ler o quarto antes do perigo e transforma o spawn em
cena, não em teleporte. Cada vez que a Granny pega você, acorda de novo
deitado — o dia recomeça.

**c) Quarto inicial fechado = tutorial sem texto.** O mapa virou um quarto 3x3
com uma única saída: uma porta com cadeado. A chave está no criado-mudo
(`POI_SLOTS[8]`, `fixed: true`) e por isso fica **fora do sorteio** da run —
`PuzzleSystem.beginRun()` não pode realocar itens fixos, senão a partida
tranca sozinha.

**d) LOS até o próprio alvo.** `hasLineOfSight()` ganhou `stopShort`: o raio
para alguns centímetros antes do alvo. O motivo é que o alvo costuma ser a
própria porta — o painel tem ~13 cm e uma amostra infeliz caía dentro dele,
fazendo a porta (e a saída da casa) ficar impossível de mirar de forma
intermitente. Agora o teste cobre 1,2 a 2,4 m da porta da frente.

**e) `input.endFrame()` no fim do frame.** Estava definido e nunca chamado:
`justPressed` nunca era limpo, então um toque em `E` repetiria a interação 60
vezes por segundo (e o pause dispararia em loop). Vai no `onRender`, depois de
todos os passos fixos terem lido o input.
