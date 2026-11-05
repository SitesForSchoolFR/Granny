/**
 * EventBus mínimo — todo cruzamento de fôlego entre sistemas passa por aqui,
 * então player/ai/world/ui nunca se importam diretamente uns nos outros.
 * Ordem de dependência permitida:
 *   ui <- core; systems <- core; ai/player/world <- core (+ eventos)
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map()
    /** Anel de eventos recentes, só com ?debug=1 (ajuda a caçar bug de ordem). */
    this.log = []
    this.debug = false
  }

  setDebug(on) {
    this.debug = !!on
    if (!on) this.log.length = 0
  }

  /** @returns {() => void} unsubscribe */
  on(type, handler) {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(handler)
    return () => this.off(type, handler)
  }

  once(type, handler) {
    const off = this.on(type, (payload) => {
      off()
      handler(payload)
    })
    return off
  }

  off(type, handler) {
    const set = this.listeners.get(type)
    if (set) {
      set.delete(handler)
      if (set.size === 0) this.listeners.delete(type)
    }
  }

  emit(type, payload) {
    if (this.debug) {
      this.log.push({ t: performance.now(), type, payload })
      if (this.log.length > 250) this.log.shift()
    }
    const set = this.listeners.get(type)
    if (!set || set.size === 0) return
    // Cópia: handlers podem se desinscrever durante o dispatch.
    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch (err) {
        console.error(`[bus] handler de "${type}" lançou:`, err)
      }
    }
  }

  clear() {
    this.listeners.clear()
  }
}

/** Tipos de evento usados no projeto — manter aqui evita string digitada errada. */
export const Ev = Object.freeze({
  STATE_CHANGED: 'state:changed',
  LOADING_PROGRESS: 'loading:progress',
  LOADING_DONE: 'loading:done',

  PLAYER_MOVED: 'player:moved',
  PLAYER_STANCE: 'player:stance',
  PLAYER_NOISE: 'player:noise',
  PLAYER_DAMAGED: 'player:damaged',

  NOISE_EMIT: 'noise:emit',
  NOISE_HEARD: 'noise:heard',

  AI_STATE: 'ai:state',
  AI_SPOTTED: 'ai:spotted',
  AI_LOST: 'ai:lost',

  POI_FOCUS: 'poi:focus',
  POI_INTERACT: 'poi:interact',
  ITEM_TAKEN: 'item:taken',

  PUZZLE_SOLVED: 'puzzle:solved',
  PUZZLE_PROGRESS: 'puzzle:progress',
  ESCAPE_READY: 'escape:ready',

  DOOR_TOGGLED: 'door:toggled',

  HUD_TOAST: 'hud:toast',
  HUD_OBJECTIVE: 'hud:objective',
  SettingsChanged: 'settings:changed',
})
