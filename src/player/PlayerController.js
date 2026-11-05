import * as THREE from 'three'
import { PLAYER } from '../core/config.js'
import { Ev } from '../core/events.js'

const STRIDE = { walk: 0.78, sprint: 1.06, crouch: 0.6 }

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
    this.crouching = false
    this.sprinting = false
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
    return this._tmp.set(this.position.x, this.position.y + this.height * PLAYER.eyeRatio + this.bobAmount, this.position.z)
  }

  get stance() {
    return this.crouching ? 'crouch' : this.sprinting ? 'sprint' : 'walk'
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

  /** @param {{x:number,z:number}} point @param {number} yawRadians */
  spawn(point, yawRadians = 0) {
    const free = this.world.nearestFree(point.x, point.z, PLAYER.radius + 0.05)
    this.position.set(free.x, 0, free.z)
    this.velocity.set(0, 0, 0)
    this.yaw = yawRadians
    this.pitch = 0
    this.crouching = false
    this.sprinting = false
    this.hidingIn = null
    this.targetHeight = PLAYER.height
    this.height = PLAYER.height
    this.bobAmount = 0
    this.distanceSinceStep = 0
    this.#applyCamera(0)
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

    // --- postura -----------------------------------------------------------
    if (!this.hidingIn) this.crouching = input.isDown('crouch')
    const wantSprint = input.isDown('sprint') && !this.crouching && input.isDown('forward')
    this.sprinting = wantSprint && !this.hidingIn
    if (this.stance !== this._lastStance) {
      this._lastStance = this.stance
      this.bus?.emit(Ev.PLAYER_STANCE, { stance: this.stance, previous: this._lastStance })
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

    const speed = this.hidingIn ? 0 : this.sprinting ? PLAYER.sprintSpeed : this.crouching ? PLAYER.crouchSpeed : PLAYER.walkSpeed
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

    // --- altura da cabeça --------------------------------------------------
    this.targetHeight = this.crouching ? PLAYER.crouchHeight : PLAYER.height
    this.height += (this.targetHeight - this.height) * Math.min(1, dt * 12)

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
    })
  }

  #footsteps(moved, dt) {
    void dt
    if (moved <= 0 || this.hidingIn) return
    const stride = this.sprinting ? STRIDE.sprint : this.crouching ? STRIDE.crouch : STRIDE.walk
    this.distanceSinceStep += moved
    if (this.distanceSinceStep < stride) return
    this.distanceSinceStep = 0
    const loudness = this.crouching
      ? PLAYER.noise.crouchFootstep
      : this.sprinting
        ? PLAYER.noise.sprint
        : PLAYER.noise.walk
    this.#emitNoise(loudness, 'footstep')
    this.audio?.footstep?.({ loudness, sprint: this.sprinting, position: this.position })
  }

  #emitNoise(loudness, type) {
    this.noiseLevel = Math.max(this.noiseLevel, loudness)
    this.noise?.emit({ position: this.position, loudness, type, source: 'player' })
  }

  #bob(dt) {
    const moving = this.speed > 0.15 ? 1 : 0
    this.bobPhase += dt * PLAYER.headBobFrequency * (this.sprinting ? 1.35 : 1) * moving
    const amp = PLAYER.headBobAmplitude * (this.sprinting ? 1.5 : 1) * moving
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
    this.sprinting = false
    this.noiseLevel = 0
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
