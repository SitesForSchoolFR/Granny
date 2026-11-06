/**
 * Fonte única de verdade para TODO valor de tuning.
 * Nenhum módulo deve declarar magnitudes "mágicas" próprio — importa daqui.
 * Unidades: metros, segundos, radians (exceto onde comentado).
 */

export const GAME = Object.freeze({
  id: 'escape-house',
  version: '0.1.0',
  /** Tick fixo da simulação. IA + física rodam aqui; render é livre. */
  fixedDt: 1 / 60,
  maxSubSteps: 5,
  /** Tentativas antes do LOSE (doc: "antes de ser pego um número máximo de vezes"). */
  maxCaught: 5,
  /** Dias do "dia N" — a cada CAUGHT o dia pode avançar (Parte 3 decide). */
  totalDays: 1,
})

/**
 * Valores de §3 do doc da Parte 2 (com os nomes que o resto do código já usa).
 * SEM sprint por decisão de design: "o jogo não é sobre reflexo, é sobre
 * decisão" — a escolha é andar (rápido e barulhento) ou agachar (lento e
 * silencioso). Não reintroduzir velocidade de corrida sem revisar isso.
 */
export const PLAYER = Object.freeze({
  // ── colisão (cilindro; ver docs/DECISOES.md §1)
  radius: 0.3,
  height: 1.75,
  crouchHeight: 1.0,
  /** Altura de obstáculo que o jogador "sobe" sem precisar de pulo. */
  stepHeight: 0.24,

  // ── câmera (doc: 1.7 em pé, 0.9 agachado, 0.3 deitado)
  eyeHeight: 1.7,
  crouchEye: 0.9,
  lyingEye: 0.3,
  /** Doc §3: transição de agachar ~0.2s, nunca instantânea. */
  crouchLerpTime: 0.2,
  /** Doc §1: levantar da cama leva ~0.5s; antes disso, ~1.5s de fade. */
  wakeUpTime: 0.5,
  wakeHoldTime: 1.5,

  // ── velocidades (doc §3: andando 3.0, agachado 1.2)
  walkSpeed: 3.0,
  crouchSpeed: 1.2,
  /** Aceleração lateral (m/s²) — alta = responsivo, baixa = escorregadio. */
  accel: 60,
  /** Amortecimento quando sem input. */
  damping: 18,
  mouseSensitivity: 0.0022,
  /** Doc §5: pitch limitado a ±85° (não vira de cabeça pra baixo). */
  maxPitch: (85 * Math.PI) / 180,

  // ── sensação
  headBobAmplitude: 0.03,
  headBobFrequency: 8.4,

  // ── interação (doc §6: raycast até ~2.5 unidades)
  interactRange: 2.5,
  interactConeDot: 0.86,
  /** Distância máxima ao ponto do esconderijo para contar como "escondido". */
  hideRadius: 1.2,

  noise: Object.freeze({
    walk: 0.42,
    crouch: 0.1,
    still: 0.0,
    /** Ruído de mexer em porta/gaveta. */
    interact: 0.55,
    /** Passo agachado quase mudo. */
    crouchFootstep: 0.06,
    /** Tábua barulhenta (doc §4 — Parte 3 detalha como a IA ouve). */
    board: 0.85,
  }),
})

export const GRANNY = Object.freeze({
  radius: 0.38,
  height: 1.95,
  patrolSpeed: 1.35,
  investigateSpeed: 2.35,
  /** Igual ao jogador (3.0) no Normal — o multiplicador vem da dificuldade. */
  chaseSpeed: 3.0,
  /**
   * Toda porta leva 2s para ser aberta pela Granny, em qualquer modo: dá
   * aviso sonoro antes dela aparecer (pedido do criador).
   */
  doorOpenTime: 2,
  /** Campo de visão (graus) e alcance máximo de visão. */
  fovDegrees: 105,
  sightRange: 16,
  /** Visão cai muito no escuro / quando o jogador está agachado atrás de móvel. */
  crouchVisibilityScale: 0.55,
  hearingRadiusPerLoudness: 22,
  /** Tempo (s) mantendo perseguição depois de perder o jogador de vista. */
  loseInterestTime: 6.5,
  /** Distância em que um toque conta como captura. */
  catchDistance: 0.95,
  /** Escondido, o jogador é invisível — a menos que ela chegue a esta distância. */
  concealSafeDistance: 1.6,
  /** Entre ver o jogador e agarrar: dá tempo de quebrar a linha de visão. */
  reactTime: 0.35,
  /** Raio (m) do "ouvido" — Parte 3 usa para filtrar ruídos irrelevantes. */
  idleHearingScale: 0.6,
})

export const HOUSE = Object.freeze({
  /** Lado de cada célula do floor plan. */
  cell: 3.0,
  wallHeight: 2.85,
  wallThickness: 0.22,
  ceilingHeight: 2.95,
  /**
   * Para onde o jogador olha ao acordar: deitado no quarto inicial (2,2), de
   * frente para a porta trancada em (4,2) — leste. Andar para frente encara o
   * vão da porta.
   */
  spawnYaw: -Math.PI / 2,
  fogColor: 0x0b0d11,
  fogDensity: 0.038,
  /**
   * Luz ambiente mínima — o jogo é escuro, mas nunca 100% cego.
   * Valor antigo (0.09) deixava a casa escura DEMAIS no console: subiu para
   * 0.2 e o jogador ainda regula em Opções → brilho.
   */
  ambient: 0.2,
  lanternRange: 11,
  lanternIntensity: 26,
})

export const AUDIO = Object.freeze({
  master: 0.9,
  sfx: 0.9,
  ambience: 0.5,
  /** Modelo de atenuação 3D dos PannerNodes. */
  distanceModel: 'inverse',
  refDistance: 2.4,
  maxDistance: 46,
  rolloffFactor: 1.35,
})

/**
 * Raio de alcance de cada tipo de barulho (doc Parte 3 §6.2), em unidades.
 * Aqui o número é DISTÂNCIA, não "volume": é isso que a IA compara com a
 * distância dela até o evento.
 */
export const NOISE_RADIUS = Object.freeze({
  footstep: 8, // passo andando normal
  crouch: 3, // passo agachado
  door: 12, // porta de madeira comum
  creakyDoor: 16, // porta de metal/rangendo
  drop: 10, // derrubar objeto pequeno
  break: 20, // derrubar objeto grande / quebrar vidro
  floorboard: 18, // tábua barulhenta
  tool: 16, // usar ferramenta (martelo, serrote)
  distraction: 15, // item de distração no ponto de impacto
  interact: 6, // revistar/guardar
  oil: 3, // aplicar óleo (quase nada)
})

export const NOISE = Object.freeze({
  /**
   * Eventos expiram em ~0.5s: são momentâneos (doc §6.5).
   * Sem isso, um barulho de 30s atrás ainda "existe" na fila.
   */
  ttl: 0.5,
  /** Loudness 1.0 => audível até hearingRadius * 1 (m). */
  maxRadius: 26,
  /** Ruído abaixo disso é descartado (evita spam de eventos). */
  minLoudness: 0.02,
  /** Decaimento do medidor de ruído no HUD (unidades/s). */
  hudDecay: 1.6,
})

export const QUALITY = Object.freeze({
  low: Object.freeze({ pixelRatioCap: 1.0, shadows: false, shadowMapSize: 512, fog: true }),
  medium: Object.freeze({ pixelRatioCap: 1.25, shadows: true, shadowMapSize: 1024, fog: true }),
  high: Object.freeze({ pixelRatioCap: 2.0, shadows: true, shadowMapSize: 2048, fog: true }),
})

/**
 * Cinco modos (pedido do criador). Sempre 5 noites: a dificuldade mexe em
 * VELOCIDADE, RUÍDO e ATALHOS — nunca em quantidade de vidas.
 *
 * Velocidade de referência: o jogador anda a 3.0 u/s (PLAYER.walkSpeed).
 * chaseScale é multiplicador sobre GRANNY.chaseSpeed (3.0):
 *   Fácil 0.87 (ela é mais lenta) · Normal 1.0 (EMPATE) ·
 *   Difícil 1.10 (ela é mais rápida) · Extreme 1.30 (muito mais rápida).
 */
export const DIFFICULTY = Object.freeze({
  practice: Object.freeze({
    label: 'Prática',
    maxCaught: 5,
    /** Sem Granny — mas as duas aranhas continuam na casa. */
    granny: false,
    spiders: true,
    grannySightScale: 0,
    grannyChaseScale: 0,
    hearingScale: 0.5,
    itemCount: 4,
    /** Fração das tábuas barulhentas que ficam ativas neste modo. */
    boardScale: 1,
    /** Modo Fácil esconde o indicador de ruído do HUD (só o som avisa). */
    showNoiseHud: true,
    /** Chance de ganhar +1 noite quando a última se esgota. */
    extraDayChance: 0,
    lockShortcuts: false,
  }),
  easy: Object.freeze({
    label: 'Fácil',
    maxCaught: 5,
    granny: true,
    spiders: true,
    grannySightScale: 0.85,
    grannyChaseScale: 0.87,
    hearingScale: 0.8,
    itemCount: 3,
    boardScale: 0.5, // menos barulhos no chão
    showNoiseHud: false, // sem símbolo de ruído no canto: só o som
    extraDayChance: 0,
    lockShortcuts: false,
  }),
  normal: Object.freeze({
    label: 'Normal',
    maxCaught: 5,
    granny: true,
    spiders: true,
    grannySightScale: 1,
    grannyChaseScale: 1, // mesma velocidade do jogador
    hearingScale: 1,
    itemCount: 4,
    boardScale: 1,
    showNoiseHud: true,
    extraDayChance: 0.35, // chance de ganhar mais um dia
    lockShortcuts: false,
  }),
  hard: Object.freeze({
    label: 'Difícil',
    maxCaught: 5,
    granny: true,
    spiders: true,
    grannySightScale: 1.15,
    grannyChaseScale: 1.1, // um pouco mais rápida que você
    hearingScale: 1.2,
    itemCount: 5,
    boardScale: 1.5, // mais barulhos no chão
    showNoiseHud: true,
    extraDayChance: 0,
    lockShortcuts: false,
  }),
  extreme: Object.freeze({
    label: 'Extreme',
    maxCaught: 5,
    granny: true,
    spiders: true,
    grannySightScale: 1.3,
    grannyChaseScale: 1.3, // muito mais rápida
    hearingScale: 1.35,
    itemCount: 5,
    boardScale: 2, // muito mais barulho pela casa
    showNoiseHud: true,
    extraDayChance: 0,
    lockShortcuts: true, // todos os atalhos trancados
  }),
})

/** Ordem em que os modos aparecem no menu. */
export const DIFFICULTY_ORDER = Object.freeze(['practice', 'easy', 'normal', 'hard', 'extreme'])

export const SAVE = Object.freeze({
  key: 'escape-house:save',
  schemaVersion: 1,
  /** true => salva a cada mudança (útil para debug, ruim para "run única"). */
  autosave: true,
})

/**
 * Atalhos padrão — tabela do doc da Parte 2 (§2), rebindável na Parte 5.
 * NÃO existe 'sprint': velocidade fixa é decisão de design (ver PLAYER).
 */
export const DEFAULT_BINDINGS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  /** Segurar (hold). Toggle fica como opção na Parte 5. */
  crouch: ['ControlLeft', 'KeyC'],
  /** E ou clique esquerdo (doc §2). */
  interact: ['KeyE', 'Mouse0'],
  inventory: ['Tab', 'KeyQ'],
  drop: ['KeyG'],
  pause: ['Escape'],
  // Extras do projeto (não conflitam com a tabela do doc).
  lantern: ['KeyL'],
  use: ['KeyF'],
  /** Espaço ARREMESSA o item da mão (pedido do criador). */
  throw: ['Space'],
  map: ['KeyM'],
  debug: ['Backquote'],
})
