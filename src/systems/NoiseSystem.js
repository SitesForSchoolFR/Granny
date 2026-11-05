import { NOISE } from '../core/config.js'
import { Ev } from '../core/events.js'

/**
 * Sistema de RUÍDO — o coração do stealth (doc Parte 1, seção 1:
 * "tensão baseada em silêncio, som e visão em cone").
 *
 * Modelo: cada ação emite um pulso com loudness 0..1 e um raio de alcance.
 * Quem se importa escuta: a IA (via `consume()`) e o HUD (via evento).
 * O ruído NÃO é física de áudio — o áudio 3D é para o JOGADOR se localizar;
 * este sistema é para o GRANNY se localizar. Dois canais, mesma fonte.
 */
export class NoiseSystem {
  /** @param {{bus?: object, config?: object}} [opts] */
  constructor({ bus, config } = {}) {
    this.bus = bus ?? null
    this.cfg = config ?? NOISE
    /** @type {Array<{x:number,z:number,loudness:number,type:string,source:string,age:number,radius:number}>} */
    this.pending = []
    /** Histórico curto para o HUD desenhar o "último barulho". */
    this.history = []
    this.level = 0
    this.total = 0
    this.enabled = true
  }

  reset() {
    this.pending.length = 0
    this.history.length = 0
    this.level = 0
    this.total = 0
  }

  /**
   * @param {{position:{x:number,y?:number,z:number}, loudness:number, type:string, source?:string}} ev
   * @returns {object|null} o evento emitido (útil para testes/debug)
   */
  emit({ position, loudness = 0, type = 'generic', source = 'world' }) {
    if (!this.enabled) return null
    const value = Math.max(0, Math.min(1, loudness))
    if (value < this.cfg.minLoudness) return null
    const event = {
      x: position.x,
      y: position.y ?? 0,
      z: position.z,
      loudness: value,
      radius: this.cfg.maxRadius * value,
      type,
      source,
      age: 0,
      id: `n${++this.total}`,
    }
    this.pending.push(event)
    if (this.pending.length > 32) this.pending.shift()
    this.history.push(event)
    if (this.history.length > 12) this.history.shift()
    this.level = Math.min(1, Math.max(this.level, value))
    this.bus?.emit(Ev.NOISE_EMIT, event)
    return event
  }

  /**
   * Entrega (e limpa) os ruídos desde o último tick do ouvinte.
   * @param {{x:number,z:number,hearingRadius?:number}} listener
   */
  consume(listener) {
    if (this.pending.length === 0) return []
    const heard = []
    const limit = listener.hearingRadius ?? this.cfg.maxRadius
    for (const event of this.pending) {
      const dist = Math.hypot(event.x - listener.x, event.z - listener.z)
      const reach = Math.min(limit, event.radius)
      if (dist > reach) continue
      const strength = 1 - dist / Math.max(1, reach)
      heard.push({ ...event, distance: dist, strength })
    }
    this.pending.length = 0
    if (heard.length) this.bus?.emit(Ev.NOISE_HEARD, { listener, heard })
    return heard
  }

  /** Decaimento do medidor do HUD; chamado no tick fixo. */
  update(dt) {
    this.level = Math.max(0, this.level - this.cfg.hudDecay * dt)
    for (const event of this.history) event.age += dt
  }

  /** Nível de "acabei de fazer barulho" para o HUD (0..1). */
  get meter() {
    return this.level
  }
}
