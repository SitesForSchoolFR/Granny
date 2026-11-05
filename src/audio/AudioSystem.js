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

    // Alias dos nomes que o POI usa → buffer sintetizado disponível.
    for (const [alias, src] of [
      ['drawer', 'creak'],
      ['doorOpen', 'creak'],
      ['doorClose', 'thump'],
      ['doorCreak', 'creak'],
      ['unlock', 'pickup'],
      ['hide', 'thump'],
      ['unhide', 'thump'],
      ['puzzle', 'pickup'],
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

  /** Passo: volume escala com a velocidade e um jitter de tom (não robótico). */
  footstep({ loudness = 0.4, sprint = false, position }) {
    this.play('footstep', {
      position,
      gain: 0.25 + loudness * 0.75,
      rate: sprint ? 1.12 : 0.94 + Math.random() * 0.12,
    })
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
