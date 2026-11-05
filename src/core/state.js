import { GAME } from './config.js'
import { EventBus, Ev } from './events.js'

/** Os sete estados pedidos na Parte 1, seção 2. */
export const GameState = Object.freeze({
  MENU: 'MENU',
  LOADING: 'LOADING',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  CAUGHT: 'CAUGHT',
  WIN: 'WIN',
  LOSE: 'LOSE',
})

/**
 * Estados em que o mundo continua visível atrás do overlay (PAUSED/CAUGHT):
 * servem para não resetar a cena acidentalmente.
 */
export const LIVE_STATES = new Set([GameState.PLAYING, GameState.PAUSED, GameState.CAUGHT])

/** Transições proibidas — protegem contra "Win" vindo de "Lose" e afins. */
const FORBIDDEN = new Map([
  [GameState.LOSE, new Set([GameState.PLAYING, GameState.WIN])],
  [GameState.WIN, new Set([GameState.PLAYING, GameState.CAUGHT])],
])

/**
 * Máquina de estados com handlers por estado.
 * Cada handler: { onEnter?(ctx), onExit?(ctx), update?(dt, ctx) }
 * update só roda nos estados que precisam simular (PLAYING).
 */
export class StateMachine {
  /**
   * @param {{ bus?: EventBus, handlers?: Record<string, object>, ctx?: object }} [options]
   */
  constructor({ bus, handlers = {}, ctx = {} } = {}) {
    this.bus = bus ?? new EventBus()
    this.ctx = ctx
    /** @type {Map<string, object>} */
    this.handlers = new Map()
    for (const [name, handler] of Object.entries(handlers)) this.add(name, handler)
    this.current = null
    this.previous = null
    this.timeInState = 0
    this.locked = false
  }

  add(name, handler) {
    this.handlers.set(name, handler ?? {})
    return this
  }

  get isPlaying() {
    return this.current === GameState.PLAYING
  }

  /** Estado atual só muda quando não estamos no meio de um update travado. */
  can(to) {
    if (!this.handlers.has(to)) return false
    const banned = FORBIDDEN.get(this.current)
    return !(banned && banned.has(to))
  }

  /** @returns {boolean} se a transição aconteceu */
  go(to, payload) {
    if (this.current === to) return false
    if (!this.can(to)) {
      console.warn(`[state] transição ignorada: ${this.current} -> ${to}`)
      return false
    }
    const from = this.current
    const handler = this.handlers.get(to)
    const prev = from ? this.handlers.get(from) : null
    this.locked = true
    try {
      prev?.onExit?.(this.ctx, to)
      this.previous = from
      this.current = to
      this.timeInState = 0
      this.ctx.statePayload = payload ?? null
      handler?.onEnter?.(this.ctx, from)
      this.bus.emit(Ev.STATE_CHANGED, { from, to, payload: payload ?? null })
    } finally {
      this.locked = false
    }
    return true
  }

  /** Voltar para onde estávamos antes (usado por PAUSED -> PLAYING). */
  back(fallback = GameState.PLAYING) {
    const target =
      this.previous && this.handlers.has(this.previous) && !FORBIDDEN.get(this.current)?.has(this.previous)
        ? this.previous
        : fallback
    return this.go(target)
  }

  update(dt) {
    if (this.locked) return
    this.timeInState += dt
    const handler = this.handlers.get(this.current)
    handler?.update?.(dt, this.ctx)
  }

  describe() {
    return this.current ?? '∅'
  }
}

/** Timer auxiliar: estados como CAUGHT usam para segurar o overlay antes de respawnar. */
export class Countdown {
  constructor(seconds = GAME.fixedDt) {
    this.duration = seconds
    this.remaining = 0
  }
  start(seconds = this.duration) {
    this.duration = seconds
    this.remaining = seconds
    return this
  }
  /** @returns {boolean} true no tick em que termina */
  tick(dt) {
    if (this.remaining <= 0) return false
    this.remaining = Math.max(0, this.remaining - dt)
    return this.remaining === 0
  }
  get active() {
    return this.remaining > 0
  }
  get progress() {
    return this.duration <= 0 ? 1 : 1 - this.remaining / this.duration
  }
  stop() {
    this.remaining = 0
  }
}
