import * as THREE from 'three'
import { AUDIO } from '../core/config.js'

/**
 * Áudio 3D com Web Audio API + PannerNode (doc Parte 1, seção 2).
 *
 * Tudo é SINTETIZADO em buffer no primeiro uso: passos = rajada de ruído
 * filtrado, rangido = serra desafinada com pitch bend, batimento = seno grave.
 * Motivo: zero bytes baixados no GitHub Pages enquanto os .mp3/.ogg definitivos
 * não entram em public/audio. Quando entrarem, o AssetLoader entrega os buffers
 * no mesmo nome de chave e isto aqui vira só o fallback.
 */
/** Qual som de "pegar" cada item faz (pedido do criador). */
const PICKUP_SFX = Object.freeze({
  key_hall: 'pickupKey',
  key_room: 'pickupKey',
  padlock_code: 'pickupPaper',
  battery: 'pickupTool',
  oil: 'pickupCloth',
  jar: 'pickupTool',
  flashlight: 'pickupTool',
  bolt_cutters: 'pickupTool',
})

export class AudioSystem {
  /** @param {{bus?: object, assets?: import('../core/AssetLoader.js').AssetLoader}} [opts] */
  constructor({ bus, assets } = {}) {
    this.bus = bus ?? null
    this.assets = assets ?? null
    this.ctx = null
    this.master = null
    this.buses = {}
    this.pan = null
    this.ready = false
    this.volume = { master: AUDIO.master, sfx: AUDIO.sfx, ambience: AUDIO.ambience }
    this.tension = 0
    this.heartbeatTimer = 0
    this.ambience = null
    this.buffers = new Map()
    this._listenerPos = new THREE.Vector3()
  }

  /** Cria contexto + grafo + buffers. Pode rodar antes do gesto (fica suspenso). */
  ensureContext() {
    if (this.ctx) return true
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) {
      console.warn('[audio] Web Audio indisponível — jogo silencioso')
      return false
    }
    this.ctx = new AC({ latencyHint: 'interactive' })
    this.#buildGraph()
    this.#synth()
    this.#startAmbience()
    this.ready = true
    return true
  }

  /** Precisa ser chamado a partir de um gesto do usuário (política de autoplay). */
  async resume() {
    if (!this.ensureContext()) return false
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch (err) {
        console.warn('[audio] resume falhou:', err?.message ?? err)
      }
    }
    return this.ready
  }

  #buildGraph() {
    const ctx = this.ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.volume.master
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 24
    comp.ratio.value = 3
    comp.attack.value = 0.005
    comp.release.value = 0.25
    this.master.connect(comp)
    comp.connect(ctx.destination)

    this.buses.sfx = ctx.createGain()
    this.buses.sfx.gain.value = this.volume.sfx
    this.buses.ambience = ctx.createGain()
    this.buses.ambience.gain.value = this.volume.ambience
    this.buses.sfx.connect(this.master)
    this.buses.ambience.connect(this.master)

    const listener = ctx.listener
    // Firefox usa positionX/Y/Z (AudioParam); Chrome usa as propriedades legadas.
    if (listener.forwardX) {
      for (const k of ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ']) {
        listener[k].value = k.startsWith('up') ? 1 : 0
      }
    }
  }

  /** Gera os buffers de SFX uma vez (mono, 44.1k, ~0.6s). */
  #synth() {
    const ctx = this.ctx
    const dur = 0.55
    const rate = ctx.sampleRate
    const n = Math.floor(dur * rate)

    const make = (fill) => {
      const buf = ctx.createBuffer(1, n, rate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < n; i += 1) fill(d, i / n, i, rate)
      return buf
    }

    let last = 0
    this.buffers.set('footstep', make((d, t, i) => {
      // ruído rosa-ish com decay rápido + toco de madeira
      const white = Math.random() * 2 - 1
      last = last * 0.86 + white * 0.14
      const env = Math.exp(-t * 14)
      d[i] = (last * 2.2 + white * 0.25) * env * 0.6
    }))
    this.buffers.set('creak', make((d, t, i) => {
      // rangido: serra com frequência que "engasga"
      const f = 170 + Math.sin(t * 22) * 45 + t * 60
      const ph = (i / rate) * f
      const saw = 2 * (ph % 1) - 1
      d[i] = saw * Math.exp(-t * 3.1) * 0.28 * (0.5 + 0.5 * Math.sin(t * 40))
    }))
    this.buffers.set('thump', make((d, t, i) => {
      const env = Math.exp(-t * 6.5)
      d[i] = Math.sin(2 * Math.PI * (52 - t * 18) * (i / rate)) * env * 0.75
    }))
    this.buffers.set('pickup', make((d, t, i) => {
      const env = Math.exp(-t * 7)
      d[i] = (Math.sin(2 * Math.PI * 660 * (i / rate)) + 0.4 * Math.sin(2 * Math.PI * 990 * (i / rate))) * env * 0.25
    }))
    this.buffers.set('denied', make((d, t, i) => {
      const env = Math.exp(-t * 5)
      d[i] = (Math.sin(2 * Math.PI * 140 * (i / rate)) > 0 ? 1 : -1) * env * 0.2
    }))

    // ── passos por superfície (pedido do criador: som muda ao andar) ──────
    this.buffers.set('stepWood', make((d, t, i) => {
      const white = Math.random() * 2 - 1
      last = last * 0.88 + white * 0.12
      const env = Math.exp(-t * 17)
      // toco seco de madeira por baixo do ruído
      const knock = Math.sin(2 * Math.PI * (150 + Math.random() * 30) * (i / rate)) * Math.exp(-t * 26) * 0.4
      d[i] = (last * 2.0 + white * 0.2 + knock) * env * 0.6
    }))
    this.buffers.set('stepCarpet', make((d, t, i) => {
      // abafado: sem ataque, só o "fump"
      const white = Math.random() * 2 - 1
      last = last * 0.95 + white * 0.05
      d[i] = last * 1.6 * Math.exp(-t * 9) * 0.5
    }))
    this.buffers.set('stepBoard', make((d, t, i) => {
      // rangido curto de tábua: serra que sobe e engasga
      const f = 210 + Math.sin(t * 30) * 60 + t * 90
      const saw = 2 * ((i / rate) * f % 1) - 1
      d[i] = saw * Math.exp(-t * 4.2) * 0.32 * (0.6 + 0.4 * Math.sin(t * 55))
    }))

    // ── pegar item: som depende do que é (pedido do criador) ─────────────
    this.buffers.set('pickupKey', make((d, t, i) => {
      // metal tilintando: dois parciais desafinados
      const env = Math.exp(-t * 6)
      d[i] =
        (Math.sin(2 * Math.PI * 1850 * (i / rate)) * 0.5 +
          Math.sin(2 * Math.PI * 2430 * (i / rate)) * 0.35 +
          (Math.random() * 2 - 1) * 0.15 * Math.exp(-t * 40)) *
        env *
        0.3
    }))
    this.buffers.set('pickupPaper', make((d, t, i) => {
      const white = Math.random() * 2 - 1
      d[i] = white * 0.5 * Math.exp(-t * 8) * (0.5 + 0.5 * Math.sin(t * 90))
    }))
    this.buffers.set('pickupTool', make((d, t, i) => {
      const env = Math.exp(-t * 9)
      d[i] = (Math.sin(2 * Math.PI * 320 * (i / rate)) + 0.6 * Math.sin(2 * Math.PI * 512 * (i / rate))) * env * 0.35
    }))
    this.buffers.set('pickupCloth', make((d, t, i) => {
      const white = Math.random() * 2 - 1
      last = last * 0.9 + white * 0.1
      d[i] = last * 1.4 * Math.exp(-t * 11) * 0.45
    }))

    // ── impacto / quebrar / óleo / voz ───────────────────────────────────
    this.buffers.set('drop', make((d, t, i) => {
      const env = Math.exp(-t * 11)
      const body = Math.sin(2 * Math.PI * (120 - t * 60) * (i / rate)) * env
      const clack = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.5
      d[i] = (body * 0.6 + clack) * 0.7
    }))
    this.buffers.set('glass', make((d, t, i) => {
      const env = Math.exp(-t * 5)
      const white = Math.random() * 2 - 1
      const shimmer = Math.sin(2 * Math.PI * (2600 + Math.random() * 900) * (i / rate))
      d[i] = (white * 0.4 + shimmer * 0.5) * env * 0.45
    }))
    this.buffers.set('oil', make((d, t, i) => {
      // esguicho curto + goteira
      const white = Math.random() * 2 - 1
      const gurgle = Math.sin(2 * Math.PI * (90 + Math.sin(t * 12) * 40) * (i / rate))
      d[i] = (white * 0.25 + gurgle * 0.3) * Math.exp(-t * 5) * 0.5
    }))
    this.buffers.set('groan', make((d, t, i) => {
      // gemido de esforço (sem palavras): formante grave que sobe e cai
      const f = 96 + Math.sin(t * 3) * 22 + t * 18
      const ph = (i / rate) * f
      const voice = Math.sin(2 * Math.PI * ph) * 0.6 + Math.sin(2 * Math.PI * ph * 2) * 0.25
      const breath = (Math.random() * 2 - 1) * 0.08
      d[i] = (voice + breath) * Math.exp(-t * 2.4) * Math.sin(t * Math.PI) * 0.4
    }))
    this.buffers.set('clock', make((d, t, i) => {
      // tique-taque: dois ataques secos
      const hit = Math.exp(-t * 120) + Math.exp(-Math.abs(t - 0.5) * 120)
      d[i] = (Math.random() * 2 - 1) * hit * 0.5 + Math.sin(2 * Math.PI * 1800 * (i / rate)) * hit * 0.2
    }))
    this.buffers.set('sting', make((d, t, i) => {
      // jumpscare: cluster dissonante, ataque instantâneo (sem rampa)
      const a = Math.sin(2 * Math.PI * (58 + t * 12) * (i / rate))
      const b = Math.sin(2 * Math.PI * (61.5 - t * 9) * (i / rate))
      const noise = (Math.random() * 2 - 1) * 0.6
      d[i] = (a + b + noise) * Math.exp(-t * 2.2) * 0.85
    }))

    // Alias dos nomes que o POI usa → buffer sintetizado disponível.
    for (const [alias, src] of [
      ['drawer', 'creak'],
      ['doorOpen', 'creak'],
      ['doorClose', 'thump'],
      ['doorCreak', 'creak'],
      ['unlock', 'pickup'],
      ['hide', 'thump'],
      ['unhide', 'thump'],
      ['unlock', 'pickup'],
      ['board', 'stepBoard'],
      ['denied', 'denied'],
    ]) {
      if (!this.buffers.has(alias)) this.buffers.set(alias, this.buffers.get(src))
    }
  }

  #startAmbience() {
    const ctx = this.ctx
    if (!ctx || this.ambience) return
    // Droninho de casa morta: duas senos detunados + ruído de sala baixíssimo.
    const osc1 = ctx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.value = 58
    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.value = 61.5
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 240
    const g = ctx.createGain()
    g.gain.value = 0.05
    osc1.connect(lp)
    osc2.connect(lp)
    lp.connect(g)
    g.connect(this.buses.ambience)
    osc1.start()
    osc2.start()
    this.ambience = { osc1, osc2, gain: g }
  }

  setVolume(kind, value) {
    this.volume[kind] = Math.max(0, Math.min(1, value))
    if (!this.ready) return
    if (kind === 'master') this.master.gain.value = this.volume.master
    else if (this.buses[kind]) this.buses[kind].gain.value = this.volume[kind]
  }

  /** Sincroniza o ouvinte com a câmera (chamado a cada render). */
  syncListener(camera) {
    if (!this.ready) return
    const l = this.ctx.listener
    const p = camera.getWorldPosition(this._listenerPos)
    const fwd = camera.getWorldDirection(new THREE.Vector3())
    if (l.positionX) {
      l.positionX.value = p.x
      l.positionY.value = p.y
      l.positionZ.value = p.z
      l.forwardX.value = fwd.x
      l.forwardY.value = fwd.y
      l.forwardZ.value = fwd.z
      l.upX.value = 0
      l.upY.value = 1
      l.upZ.value = 0
    } else if (l.setPosition) {
      l.setPosition(p.x, p.y, p.z)
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0)
    }
  }

  /** @returns {boolean} se o som tocou */
  play(name, { position, gain = 1, rate = 1, loop = false, bus = 'sfx' } = {}) {
    if (!this.ready) return false
    const buffer = this.assets?.sound?.(name) ?? this.buffers.get(name)
    if (!buffer) return false
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = loop
    src.playbackRate.value = rate
    const g = ctx.createGain()
    g.gain.value = Math.max(0.0001, gain)

    if (position) {
      const panner = ctx.createPanner()
      panner.panningModel = 'HRTF'
      panner.distanceModel = AUDIO.distanceModel
      panner.refDistance = AUDIO.refDistance
      panner.maxDistance = AUDIO.maxDistance
      panner.rolloffFactor = AUDIO.rolloffFactor
      if (panner.positionX) {
        panner.positionX.value = position.x
        panner.positionY.value = position.y ?? 0.4
        panner.positionZ.value = position.z
      } else if (panner.setPosition) {
        panner.setPosition(position.x, position.y ?? 0.4, position.z)
      }
      src.connect(g)
      g.connect(panner)
      panner.connect(this.buses[bus] ?? this.master)
    } else {
      src.connect(g)
      g.connect(this.buses[bus] ?? this.master)
    }
    src.start()
    src.onended = () => {
      src.disconnect()
      g.disconnect()
    }
    return true
  }

  /**
   * Passo: o som depende da SUPERFÍCIE e da postura (pedido do criador).
   * @param {{loudness?:number, crouch?:boolean, surface?:string, position?:object}} opts
   */
  footstep({ loudness = 0.4, crouch = false, surface = 'wood', position } = {}) {
    const name = surface === 'board' ? 'stepBoard' : surface === 'carpet' ? 'stepCarpet' : 'stepWood'
    this.play(name, {
      position,
      gain: (0.25 + loudness * 0.75) * (crouch ? 0.45 : 1),
      rate: (crouch ? 0.82 : 0.94) + Math.random() * 0.12,
    })
  }

  /**
   * Pegar item: o som depende do QUE foi pego (metal tilinta, papel farfalha,
   * ferramenta bate, pano é abafado).
   * @param {string} itemId
   */
  pickup(itemId, position) {
    const name = PICKUP_SFX[itemId] ?? 'pickup'
    this.play(name, { position, gain: 0.85, rate: 0.97 + Math.random() * 0.08 })
  }

  creak(position, gain = 0.6) {
    this.play('creak', { position, gain })
  }

  /** Tensão 0..1 — batimento cardíaco do jogador, mais rápido quanto mais perto da Granny. */
  setTension(value) {
    this.tension = Math.max(0, Math.min(1, value))
    if (this.ambience) this.ambience.gain.gain.value = 0.05 + this.tension * 0.075
  }

  update(dt) {
    if (!this.ready || this.tension <= 0.05) return
    const bpm = 52 + this.tension * 66
    this.heartbeatTimer += dt
    const interval = 60 / bpm
    if (this.heartbeatTimer >= interval) {
      this.heartbeatTimer = 0
      this.play('thump', { gain: 0.12 + this.tension * 0.4, rate: 0.9 })
    }
  }
}
