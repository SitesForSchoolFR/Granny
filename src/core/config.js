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

export const PLAYER = Object.freeze({
  height: 1.72,
  crouchHeight: 1.02,
  eyeRatio: 0.94, // eye = height * eyeRatio
  radius: 0.3,
  walkSpeed: 2.65,
  sprintSpeed: 4.55,
  crouchSpeed: 1.15,
  /** Aceleração lateral (m/s²) — alta = responsivo, baixa = escorregadio. */
  accel: 60,
  /** Amortecimento quando sem input. */
  damping: 18,
  mouseSensitivity: 0.0022,
  maxPitch: Math.PI / 2 - 0.02,
  /** Altura de obstáculo que o jogador "sobe" sem precisar de pulo. */
  stepHeight: 0.24,
  headBobAmplitude: 0.035,
  headBobFrequency: 8.4,
  /** Alcance de interação (E). */
  interactRange: 2.1,
  /** Raio do cone de visão do jogador para HUD focus. */
  interactConeDot: 0.86,
  /** Distância máxima ao ponto do esconderijo para contar como "escondido". */
  hideRadius: 1.2,
  noise: Object.freeze({
    sprint: 1.0,
    walk: 0.42,
    crouch: 0.1,
    still: 0.0,
    /** Ruído de mexer em porta/gaveta. */
    interact: 0.55,
    /** Passo agachado quase mudo. */
    crouchFootstep: 0.06,
  }),
})

export const GRANNY = Object.freeze({
  radius: 0.38,
  height: 1.95,
  patrolSpeed: 1.35,
  investigateSpeed: 2.35,
  chaseSpeed: 3.35,
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
  /** Para onde o jogador olha ao acordar (na planta, olhando o corredor). */
  spawnYaw: -Math.PI / 2,
  fogColor: 0x07080a,
  fogDensity: 0.055,
  /** Luz ambiente mínima — o jogo é escuro, mas nunca 100% cego. */
  ambient: 0.09,
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

export const NOISE = Object.freeze({
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

export const DIFFICULTY = Object.freeze({
  easy: Object.freeze({
    label: 'Fácil',
    maxCaught: 7,
    grannySightScale: 0.7,
    grannyChaseScale: 0.85,
    hearingScale: 0.7,
    itemCount: 3,
  }),
  normal: Object.freeze({
    label: 'Normal',
    maxCaught: 5,
    grannySightScale: 1,
    grannyChaseScale: 1,
    hearingScale: 1,
    itemCount: 4,
  }),
  nightmare: Object.freeze({
    label: 'Pesadelo',
    maxCaught: 3,
    grannySightScale: 1.25,
    grannyChaseScale: 1.12,
    hearingScale: 1.3,
    itemCount: 5,
  }),
})

export const SAVE = Object.freeze({
  key: 'escape-house:save',
  schemaVersion: 1,
  /** true => salva a cada mudança (útil para debug, ruim para "run única"). */
  autosave: true,
})

/** Atalhos padrão — rebindável na Parte 5 (settings), por isso fica aqui. */
export const DEFAULT_BINDINGS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'KeyC'],
  interact: ['KeyE'],
  use: ['KeyF', 'Space'],
  drop: ['KeyQ'],
  lantern: ['KeyL'],
  inventory: ['Tab'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
  debug: ['Backquote'],
})
