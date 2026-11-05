import * as THREE from 'three'
import { PLAYER } from '../core/config.js'
import { Ev } from '../core/events.js'

const STRIDE = { walk: 0.78, crouch: 0.6 }
/**
 * Aproxima `current` de `target` em EXATAMENTE `seconds` (linear, sem overshoot
 * e sem rabo exponencial). `span` é a distância TOTAL do trajeto possível —
 * sem ele, o passo encolhe a cada frame e a transição nunca termina na hora.
 */
function approach(current, target, seconds, dt, span) {
  if (seconds <= 0) return target
  const rate = Math.abs(span ?? target - current) / seconds
  const step = rate * dt
  const diff = target - current
  return Math.abs(diff) <= step ? target : current + Math.sign(diff) * step
}

/**
 * Controlador de primeira pessoa: mouse look (Pointer Lock), movimento com
 * aceleração/amortecimento, postura (em pé / agachado), colisão por cápsula
 * simplificada, head bob e — importante para o stealth — RUÍDO DE PASSOS.
 *
 * Estado do jogador = posição dos PÉS (this.position.y é o chão sob ele).
 * `eye` é derivado (altura da cabeça + bob), nunca o contrário.
 *
 * A Parte 2 (Spawn/Controles/Movimentação) refina isto: stamina, escorregar,
 * vault em móveis baixos e curva de aceleração final. O que está aqui já é a
 * estrutura que as Partes 3/4/5 esperam.
 */
export class PlayerController {
  /**
   * @param {{
   *   camera: THREE.PerspectiveCamera,
   *   world: import('../world/CollisionWorld.js').CollisionWorld,
   *   input: import('../player/InputManager.js').InputManager,
   *   bus?: object, noise?: object, audio?: object,
   *   onLantern?: (on:boolean)=>void
   * }} opts
   */
  constructor({ camera, world, input, bus, noise, audio, onLantern }) {
    this.camera = camera
    this.world = world
    this.input = input
    this.bus = bus ?? null
    this.noise = noise ?? null
    this.audio = audio ?? null
    this.onLantern = onLantern ?? null

    this.position = new THREE.Vector3()
    this.velocity = new THREE.Vector3()
    this.yaw = 0
    this.pitch = 0
    this.height = PLAYER.height
    this.targetHeight = PLAYER.height
    /** Altura dos olhos acima dos pés — é o que a câmera usa. */
    this.eyeY = PLAYER.eyeHeight
    this.crouching = false
    /** 'lying' (acordando) → 'rising' (levantando) → 'up'. Doc Parte 2 §1. */
    this.wake = { phase: 'up', hold: 0, rising: 0 }
    this.grounded = true
    this.lanternOn = false
    /** @type {object|null} POI de esconderijo atual */
    this.hidingIn = null
    this.bobPhase = 0
    this.bobAmount = 0
    this.distanceSinceStep = 0
    this.speed = 0
    this._lastStance = 'walk'
    this.noiseLevel = 0
    this.alive = true
    this._mouse = { x: 0, y: 0 }
    this._tmp = new THREE.Vector3()
  }

  /** Posição dos olhos, para câmera e raycasts de interação. */
  get eye() {
    return this._tmp.set(this.position.x, this.position.y + this.eyeY + this.bobAmount, this.position.z)
  }

  get stance() {
    if (this.wake.phase !== 'up') return 'lying'
    return this.crouching ? 'crouch' : 'walk'
  }

  /** Doc §1: o jogador só assume o controle depois do fade-in. */
  get hasControl() {
    return this.wake.phase === 'up' || this.wake.phase === 'rising'
  }

  /** Quanto da "levantada" já aconteceu (0 deitado, 1 em pé). */
  get wakeProgress() {
    return this.wake.phase === 'lying' ? 0 : this.wake.phase === 'up' ? 1 : this.wake.rising
  }

  /** true quando o jogador não pode ser visto (esconderijo cobrindo a mira). */
  /** Distância até o esconderijo atual (Infinity se não estiver em nenhum). */
  get hideDistance() {
    if (!this.hidingIn) return Infinity
    return Math.hypot(this.position.x - this.hidingIn.point.x, this.position.z - this.hidingIn.point.z)
  }

  /**
   * Escondido de verdade = dentro do esconderijo E perto o bastante dele.
   * A IA consulta isso; ficar "encostado" na mesa não conta.
   */
  get concealed() {
    return !!this.hidingIn && this.hideDistance <= PLAYER.hideRadius
  }

  /**
   * @param {{x:number,z:number}} point
   * @param {number} yawRadians
   * @param {{lying?: boolean}} [opts] `lying: true` = sequência de spawn do
   *   doc §1: acorda deitado (olho a 0.3m) e só recebe controle depois do
   *   fade-in; o primeiro input de movimento dispara a levantada de 0.5s.
   */
  spawn(point, yawRadians = 0, { lying = false } = {}) {
    const free = this.world.nearestFree(point.x, point.z, PLAYER.radius + 0.05)
    this.position.set(free.x, 0, free.z)
    this.velocity.set(0, 0, 0)
    this.yaw = yawRadians
    this.pitch = 0
    this.crouching = false
    this.hidingIn = null
    this.targetHeight = PLAYER.height
    this.height = PLAYER.height
    this.bobAmount = 0
    this.distanceSinceStep = 0
    this.wake = lying
      ? { phase: 'lying', hold: PLAYER.wakeHoldTime, rising: 0 }
      : { phase: 'up', hold: 0, rising: 1 }
    this.eyeY = lying ? PLAYER.lyingEye : PLAYER.eyeHeight
    this.#applyCamera(0)
  }

  /** Deita o jogador de novo (usado ao reiniciar a run no quarto inicial). */
  lieDown() {
    this.wake = { phase: 'lying', hold: PLAYER.wakeHoldTime, rising: 0 }
    this.eyeY = PLAYER.lyingEye
    this.crouching = false
    this.velocity.set(0, 0, 0)
  }

  setLantern(on) {
    this.lanternOn = !!on
    this.onLantern?.(this.lanternOn)
    this.bus?.emit('player:lantern', { on: this.lanternOn })
  }

  /**
   * Entrar/sair de um esconderijo.
   *
   * NÃO teleporta: o jogador interage de onde está e fica parado ali
   * (movimento travado enquanto escondido). Só se ele estiver mais longe que
   * `PLAYER.hideRadius` do ponto é que encostamos até a borda — nunca para
   * dentro do colisor do móvel.
   *
   * @param {object|null} poi POI de esconderijo, ou null para sair.
   */
  setHidingSpot(poi) {
    this.hidingIn = poi ?? null
    if (!poi) return
    const dx = this.position.x - poi.point.x
    const dz = this.position.z - poi.point.z
    const d = Math.hypot(dx, dz)
    // 0.85 do raio: encosta sem flertar com a borda (evita ficar "quase fora"
    // por erro de ponto flutuante).
    const target = PLAYER.hideRadius * 0.85
    if (d > target) {
      const k = (d - target) / d
      this.position.x -= dx * k
      this.position.z -= dz * k
    }
    this.velocity.set(0, 0, 0)
    this.crouching = true
    this.targetHeight = PLAYER.crouchHeight
  }

  /** Tick da simulação (passo fixo). */
  update(dt) {
    const input = this.input

    // --- olhar -------------------------------------------------------------
    input.consumeMouseDelta(this._mouse)
    const sens = PLAYER.mouseSensitivity
    this.yaw -= this._mouse.x * sens
    this.pitch -= this._mouse.y * sens
    const lim = PLAYER.maxPitch
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch))
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2

    // --- acordar (doc §1) --------------------------------------------------
    this.#updateWake(dt, input)

    // --- postura -----------------------------------------------------------
    if (!this.hidingIn) this.crouching = input.isDown('crouch')
    if (this.stance !== this._lastStance) {
      const previous = this._lastStance
      this._lastStance = this.stance
      this.bus?.emit(Ev.PLAYER_STANCE, { stance: this.stance, previous })
    }

    // --- input de movimento no plano --------------------------------------
    const ax = input.axis('left', 'right')
    const az = input.axis('back', 'forward')
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    let dirX = -sin * az + cos * ax
    let dirZ = -cos * az - sin * ax
    const len = Math.hypot(dirX, dirZ)
    if (len > 0) {
      dirX /= len
      dirZ /= len
    }

    // Deitado não anda: o controle só existe depois do fade (hasControl).
    const speed = !this.hasControl || this.hidingIn ? 0 : this.crouching ? PLAYER.crouchSpeed : PLAYER.walkSpeed
    const targetX = dirX * speed
    const targetZ = dirZ * speed
    const rate = len > 0 ? PLAYER.accel : PLAYER.damping
    // Exponencial estável em qualquer dt (nada de "dt grande => overshoot").
    const k = 1 - Math.exp(-(rate / Math.max(speed || 1, 1)) * dt * 6)
    this.velocity.x += (targetX - this.velocity.x) * k
    this.velocity.z += (targetZ - this.velocity.z) * k
    if (Math.hypot(this.velocity.x, this.velocity.z) < 0.02 && len === 0) {
      this.velocity.x = 0
      this.velocity.z = 0
    }

    // --- colisão + chão ----------------------------------------------------
    const desired = { x: this.position.x + this.velocity.x * dt, z: this.position.z + this.velocity.z * dt }
    const resolved = this.world.resolveCircle(desired, {
      radius: PLAYER.radius,
      height: this.height,
      step: PLAYER.stepHeight,
      feetY: this.position.y,
    })
    const moved = Math.hypot(resolved.x - this.position.x, resolved.z - this.position.z)
    this.position.x = resolved.x
    this.position.z = resolved.z
    this.groundHeight = this.world.groundHeight(resolved.x, resolved.z, this.position.y, PLAYER.stepHeight)
    if (Math.abs(this.groundHeight - this.position.y) > 1e-4) {
      // Sobe degrau; desce com "gravidade" rápida o suficiente pra não flutuar.
      this.position.y += (this.groundHeight - this.position.y) * Math.min(1, dt * 14)
    }
    if (resolved.blocked && this.speed > 3.2) this.#emitNoise(PLAYER.noise.interact * 0.35, 'brush')

    this.speed = moved / Math.max(dt, 1e-4)
    this.#footsteps(moved, dt)
    this.#bob(dt)

    // --- altura da cabeça (doc §3: lerp de ~0.2s, nunca instantâneo) --------
    this.targetHeight = this.crouching ? PLAYER.crouchHeight : PLAYER.height
    const heightSpan = Math.abs(PLAYER.height - PLAYER.crouchHeight)
    this.height = approach(this.height, this.targetHeight, PLAYER.crouchLerpTime, dt, heightSpan)
    const rising = this.wake.phase === 'rising'
    const eyeTarget = this.wake.phase === 'lying'
      ? PLAYER.lyingEye
      : this.crouching
        ? PLAYER.crouchEye
        : PLAYER.eyeHeight
    const eyeSpan = rising ? Math.abs(PLAYER.eyeHeight - PLAYER.lyingEye) : Math.abs(PLAYER.eyeHeight - PLAYER.crouchEye)
    this.eyeY = approach(this.eyeY, eyeTarget, rising ? PLAYER.wakeUpTime : PLAYER.crouchLerpTime, dt, eyeSpan)

    // --- lanternada --------------------------------------------------------
    if (input.wasPressed('lantern')) this.setLantern(!this.lanternOn)

    this.#applyCamera(dt)
    this.bus?.emit(Ev.PLAYER_MOVED, {
      x: this.position.x,
      z: this.position.z,
      y: this.position.y,
      speed: this.speed,
      stance: this.stance,
      yaw: this.yaw,
      concealed: this.concealed,
      wake: this.wake.phase,
    })
  }

  #footsteps(moved, dt) {
    void dt
    if (moved <= 0 || this.hidingIn) return
    const stride = this.crouching ? STRIDE.crouch : STRIDE.walk
    this.distanceSinceStep += moved
    if (this.distanceSinceStep < stride) return
    this.distanceSinceStep = 0
    // Doc §4: piso marcado ("tábua barulhenta") denuncia o passo.
    const board = this.world.boardAt?.(this.position.x, this.position.z)
    if (board) {
      const loudness = Math.max(board.loudness ?? PLAYER.noise.board, PLAYER.noise.walk)
      this.#emitNoise(loudness, board.type ?? 'board')
      this.audio?.creak?.({ position: this.position, gain: 0.9 })
      return
    }
    const loudness = this.crouching ? PLAYER.noise.crouchFootstep : PLAYER.noise.walk
    this.#emitNoise(loudness, 'footstep')
    this.audio?.footstep?.({ loudness, crouch: this.crouching, position: this.position })
  }

  /**
   * Sequência de spawn (doc §1): segura o controle por `wakeHoldTime` e, no
   * primeiro input de movimento, levanta a câmera em `wakeUpTime`.
   */
  #updateWake(dt, input) {
    const w = this.wake
    if (w.phase === 'up') return
    if (w.phase === 'lying') {
      w.hold -= dt
      if (w.hold > 0) return
      const wantsToMove =
        input.isDown('forward') || input.isDown('back') || input.isDown('left') || input.isDown('right')
      if (!wantsToMove) return
      w.phase = 'rising'
      w.rising = 0
      return
    }
    // rising
    // O olho sobe de verdade no bloco de altura (eyeY), em wakeUpTime.
    w.rising = Math.min(1, w.rising + dt / PLAYER.wakeUpTime)
    if (w.rising >= 1) w.phase = 'up' // postura 'walk' é emitida pelo diff abaixo
  }

  #emitNoise(loudness, type) {
    this.noiseLevel = Math.max(this.noiseLevel, loudness)
    this.noise?.emit({ position: this.position, loudness, type, source: 'player' })
  }

  #bob(dt) {
    const moving = this.speed > 0.15 ? 1 : 0
    this.bobPhase += dt * PLAYER.headBobFrequency * moving
    const amp = PLAYER.headBobAmplitude * moving
    const targetBob = Math.sin(this.bobPhase) * amp * 0.5
    this.bobAmount += (targetBob - this.bobAmount) * Math.min(1, dt * 22)
  }

  #applyCamera() {
    const eye = this.eye
    this.camera.position.set(eye.x, eye.y, eye.z)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  /** Vetor olhar no plano XZ (para IA/cone). */
  lookDir() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }
  }

  /** Reset total entre dias/tentativas. */
  reset() {
    this.velocity.set(0, 0, 0)
    this.hidingIn = null
    this.crouching = false
    this.noiseLevel = 0
    this.wake = { phase: 'up', hold: 0, rising: 1 }
    this.eyeY = PLAYER.eyeHeight
  }

  snapshot() {
    return {
      x: +this.position.x.toFixed(2),
      z: +this.position.z.toFixed(2),
      y: +this.position.y.toFixed(2),
      speed: +this.speed.toFixed(2),
      stance: this.stance,
      lantern: this.lanternOn,
      hidden: this.concealed,
    }
  }
}
