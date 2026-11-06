import * as THREE from 'three'
import { GRANNY, NOISE_RADIUS, PLAYER } from '../core/config.js'
import { Ev } from '../core/events.js'

export const AIState = Object.freeze({
  PATROL: 'PATROL',
  INVESTIGATE: 'INVESTIGATE',
  CHASE: 'CHASE',
  SEARCH: 'SEARCH',
})

const PATROL_POINTS = ['hall', 'kitchen', 'bedroom', 'living', 'bathroom', 'study']

/**
 * IA perseguidora — visão em cone + audição + patrulha por waypoints.
 *
 * Este é o ESQUELETO entregue na Parte 1: percepção, tomada de decisão e
 * perseguição já funcionam (dá para jogar e ser pego), mas a Parte 3
 * ("IA, Pathfinding e Detecção") assume daqui:
 *   - busca em nível de tarefa (voltar ao último cômodo suspeito, checar
 *     esconderijos, ouvir respiração),
 *   - estados de raiva/fadiga, andar "no escuro" e chutar objetos,
 *   - animação do modelo .glb e transições de velocidade audíveis.
 *
 * Regra de design que NÃO muda: ela nunca vê através de parede e nunca corre
 * mais que o jogador sprintando (só por pouco) — 100% do medo vem de áudio.
 */
export class GrannyAI {
  /**
   * @param {{world:object, nav:import('./NavGrid.js').NavGrid, house:object,
   *          noise:object, bus?:object, audio?:object, scale?:object}} opts
   */
  constructor({ world, nav, house, noise, bus, audio, scale = {} }) {
    this.world = world
    this.nav = nav
    this.house = house
    this.noise = noise
    this.bus = bus ?? null
    this.audio = audio ?? null
    this.scale = { sight: 1, chase: 1, hearing: 1, ...scale }
    /** false no modo Prática. */
    this.enabled = true
    /** @type {{door: object, t: number}|null} porta sendo aberta (2s). */
    this.opening = null

    this.position = new THREE.Vector3()
    this.facing = 0
    this.state = AIState.PATROL
    this.path = []
    this.pathIndex = 0
    this.lastKnownPlayer = null
    this.interestTimer = 0
    this.lostTimer = 0
    this.patrolIndex = 0
    this.patrolPause = 0
    this.seesPlayer = false
    this.spotTime = 0
    this.throttle = 0
    this.repathTimer = 0

    this.object3D = this.#buildBody()
  }

  #buildBody() {
    const group = new THREE.Group()
    group.name = 'granny'
    const skin = new THREE.MeshStandardMaterial({ color: 0x7a7f86, roughness: 0.92 })
    const dress = new THREE.MeshStandardMaterial({ color: 0x2f3540, roughness: 0.95 })
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(GRANNY.radius, GRANNY.height - GRANNY.radius * 2, 4, 10), dress)
    body.position.y = GRANNY.height / 2
    body.castShadow = true
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin)
    head.position.y = GRANNY.height - 0.1
    // Marker de "ela te viu": dois pontos quentes na cara.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd9463a })
    const eyes = new THREE.Group()
    for (const dx of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), eyeMat)
      eye.position.set(dx, 0.03, -0.16)
      eyes.add(eye)
    }
    eyes.visible = false
    head.add(eyes)
    group.add(body, head, eyes)
    this.eyeMesh = eyes
    this.bodyMesh = body
    return group
  }

  /** Modo Prática desliga a perseguidora sem tirá-la do mundo. */
  setEnabled(on) {
    this.enabled = !!on
    if (!on) {
      this.opening = null
      this.path = []
      this.pathIndex = 0
    }
  }

  spawn(point) {
    this.opening = null
    const free = this.world.nearestFree(point.x, point.z, GRANNY.radius + 0.05)
    this.position.set(free.x, 0, free.z)
    this.object3D.position.copy(this.position)
    this.state = AIState.PATROL
    this.path = []
    this.pathIndex = 0
    this.lastKnownPlayer = null
    this.seesPlayer = false
    this.lostTimer = 0
    this.interestTimer = 0
  }

  get radius() {
    return GRANNY.radius
  }

  setState(next, reason) {
    if (this.state === next) return
    const from = this.state
    this.state = next
    this.object3D.userData.state = next
    this.bus?.emit(Ev.AI_STATE, { from, to: next, reason })
  }

  /** Cone + linha de visão. `player` = {position, concealed, crouching}. */
  canSee(player) {
    const dx = player.position.x - this.position.x
    const dz = player.position.z - this.position.z
    const dist = Math.hypot(dx, dz)
    let range = GRANNY.sightRange * this.scale.sight
    if (player.crouching) range *= GRANNY.crouchVisibilityScale
    if (dist > range) return false
    // Escondido: invisível. Mas chegando perto assim o esconderijo vira
    // armadilha em vez de escudo — ela encosta e encontra.
    if (player.concealed && dist > GRANNY.concealSafeDistance) return false
    const angle = Math.atan2(dx, dz)
    let delta = angle - this.facing
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    const halfFov = (GRANNY.fovDegrees * Math.PI) / 180 / 2
    const insideCone = Math.abs(delta) < halfFov
    const eyeY = this.position.y + GRANNY.height * 0.85
    const targetY = player.position.y + player.height * 0.6
    if (!this.world.hasLineOfSight({ x: this.position.x, y: eyeY, z: this.position.z }, { x: player.position.x, y: targetY, z: player.position.z })) {
      // Fora do cone ou atrás de móvel: só escuta.
      return insideCone && dist < 2.4 // "percepção periférica" curta
    }
    return insideCone || dist < 2.2
  }

  /** Ruídos novos do jogador alimentam a investigação. */
  #listen() {
    if (!this.noise) return
    const heard = this.noise.consume({
      x: this.position.x,
      z: this.position.z,
      // O raio de cada evento vem da tabela NOISE_RADIUS (doc §6.2); aqui só
      // entra o multiplicador da dificuldade. O raio antigo fica como teto
      // de segurança para eventos sem raio explícito.
      hearingScale: this.scale.hearing,
      hearingRadius: GRANNY.hearingRadiusPerLoudness * this.scale.hearing,
    })
    if (heard.length === 0) return
    let loudest = null
    for (const n of heard) {
      if (n.source !== 'player') continue
      if (!loudest || n.strength > loudest.strength) loudest = n
    }
    if (!loudest) return
    const dir = { x: loudest.x, z: loudest.z }
    if (this.state !== AIState.CHASE) {
      this.lastKnownPlayer = dir
      this.interestTimer = 4.5
      this.setState(loudest.strength > 0.55 ? AIState.CHASE : AIState.INVESTIGATE, 'noise')
      this.#repath(dir)
    } else {
      this.lastKnownPlayer = dir
      this.lostTimer = 0
    }
    this.bus?.emit(Ev.AI_SPOTTED, { kind: 'heard', strength: loudest.strength })
  }

  #patrolTarget() {
    const rooms = this.house.rooms.filter((r) => !r.outside)
    for (let i = 0; i < rooms.length; i += 1) {
      const room = rooms[(this.patrolIndex + i) % rooms.length]
      const cx = Math.floor((room.x0 + room.x1) / 2)
      const cz = Math.floor((room.z0 + room.z1) / 2)
      const w = this.house.cellToWorld(cx, cz)
      if (this.house.isWalkable(cx, cz)) return { ...w, room }
    }
    return { ...this.house.spawn.player, room: null }
  }

  #repath(target) {
    const path = this.nav.path(this.position, target)
    if (!path) return false
    this.path = path
    this.pathIndex = 0
    return true
  }

  #advance(dt, speed) {
    const node = this.path[this.pathIndex]
    if (!node) return true
    const dx = node.world.x - this.position.x
    const dz = node.world.z - this.position.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.35) {
      this.pathIndex += 1
      return this.pathIndex >= this.path.length
    }
    const want = Math.atan2(dx, dz)
    let delta = want - this.facing
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    this.facing += Math.sign(delta) * Math.min(Math.abs(delta), dt * 5.2)
    const step = speed * dt
    const resolved = this.world.resolveCircle(
      { x: this.position.x + (dx / dist) * step, z: this.position.z + (dz / dist) * step },
      { radius: GRANNY.radius, height: GRANNY.height, step: 0.3, feetY: this.position.y },
    )
    // Se bateu numa porta fechada, ABRE — mas leva 2s (pedido do criador, em
    // qualquer dificuldade). São 2 segundos de aviso sonoro antes dela passar.
    if (resolved.blocked) {
      const door = this.house.nearestDoor({ x: resolved.x, z: resolved.z }, 1.9)
      if (door && !door.isOpen && !door.locked) {
        if (this.opening?.door !== door) {
          this.opening = { door, t: 0 }
          // Rangido baixo no começo: quem estiver perto ouve a maçaneta.
          this.noise?.emit({
            position: door.center,
            loudness: 0.12,
            radius: NOISE_RADIUS.door * 0.35,
            type: 'doorHandle',
            source: 'granny',
          })
          this.audio?.creak?.(door.center, 0.35)
        }
        this.opening.t += dt
        if (this.opening.t >= GRANNY.doorOpenTime) {
          const res = this.opening.door.toggle()
          if (res.ok) {
            this.noise?.emit({
              position: door.center,
              loudness: res.loudness,
              radius: door.creak >= 0.5 ? NOISE_RADIUS.creakyDoor : NOISE_RADIUS.door,
              type: 'door',
              source: 'granny',
            })
            this.audio?.creak?.(door.center, 0.7)
          }
          this.opening = null
        }
      } else {
        this.opening = null
      }
      this.repathTimer = 0.35 // reavalia a rota em instantes
      return false
    }
    this.opening = null
    this.position.x = resolved.x
    this.position.z = resolved.z
    this.position.y = this.world.groundHeight(resolved.x, resolved.z, this.position.y, 0.3)
    return false
  }

  /** @param {object} player PlayerController */
  update(dt, player) {
    if (!player) return
    // Modo Prática: a Granny não existe (as aranhas continuam — doc §4).
    if (this.enabled === false) {
      this.noise?.consume({ x: this.position.x, z: this.position.z })
      return
    }
    this.#listen()
    const seen = this.canSee(player)

    if (seen) {
      if (!this.seesPlayer) {
        this.bus?.emit(Ev.AI_SPOTTED, { kind: 'seen' })
        this.spotTime = 0
        this.audio?.creak?.(this.position, 0.25)
      }
      this.seesPlayer = true
      this.spotTime += dt
      this.lastKnownPlayer = { x: player.position.x, z: player.position.z }
      this.lostTimer = 0
      this.setState(AIState.CHASE, 'seen')
    } else if (this.state === AIState.CHASE) {
      this.seesPlayer = false
      this.lostTimer += dt
      if (this.lostTimer > GRANNY.loseInterestTime) {
        this.setState(AIState.SEARCH, 'lost')
        this.lostTimer = 0
      }
    } else if (this.state === AIState.SEARCH) {
      this.seesPlayer = false
      this.interestTimer -= dt
      if (this.interestTimer <= 0) this.setState(AIState.PATROL, 'bored')
    } else {
      this.seesPlayer = false
      if (this.interestTimer > 0) {
        this.interestTimer -= dt
        if (this.interestTimer <= 0) this.setState(AIState.PATROL, 'done')
      }
    }

    let speed = GRANNY.patrolSpeed
    switch (this.state) {
      case AIState.CHASE: {
        speed = GRANNY.chaseSpeed * this.scale.chase
        // Persegue direto quando está perto (o path do grid atrapalha no corpo a corpo).
        const near = Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z) < 5
        if (near) {
          const done = this.#advance(dt, speed)
          if (done) this.#repath(this.lastKnownPlayer ?? this.#patrolTarget())
          else this.path = [{ world: { x: player.position.x, z: player.position.z } }]
        } else {
          this.repathTimer -= dt
          if (this.pathIndex >= this.path.length || this.repathTimer <= 0) {
            this.#repath(this.lastKnownPlayer ?? player.position)
            this.repathTimer = 0.8
          }
          this.#advance(dt, speed)
        }
        break
      }
      case AIState.INVESTIGATE:
      case AIState.SEARCH: {
        speed = GRANNY.investigateSpeed
        this.repathTimer -= dt
        if (this.pathIndex >= this.path.length && this.repathTimer <= 0) {
          this.#repath(this.lastKnownPlayer ?? this.#patrolTarget())
          this.repathTimer = 1.2
        }
        if (this.#advance(dt, speed)) this.setState(AIState.SEARCH, 'arrived')
        break
      }
      default: {
        speed = GRANNY.patrolSpeed
        if (this.patrolPause > 0) {
          this.patrolPause -= dt
          speed = 0
        } else if (this.pathIndex >= this.path.length) {
          const target = this.#patrolTarget()
          if (this.nav.distance(this.position, target) < 1.2) {
            this.patrolIndex += 1
            this.patrolPause = 1.2 + this.random() * 1.6
          } else {
            this.#repath(target)
          }
        } else if (this.#advance(dt, speed)) {
          this.patrolIndex += 1
        }
        break
      }
    }

    // Facing segue o movimento quando não está olhando para o jogador.
    if (this.state !== AIState.CHASE && this.path[this.pathIndex]) {
      const n = this.path[this.pathIndex]
      this.facing = Math.atan2(n.world.x - this.position.x, n.world.z - this.position.z)
    } else if (seen) {
      this.facing = Math.atan2(player.position.x - this.position.x, player.position.z - this.position.z)
    }

    this.object3D.position.set(this.position.x, this.position.y, this.position.z)
    this.object3D.rotation.y = this.facing
    if (this.eyeMesh) this.eyeMesh.visible = this.state === AIState.CHASE
    this.throttle = speed / (GRANNY.chaseSpeed * this.scale.chase)

    // Captura.
    const dist = Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z)
    // Altura dos olhos do jogador (doc Parte 2 §3: 1.7 em pé, 0.9 agachado).
    const eye = player.position.y + (player.eyeY ?? PLAYER.eyeHeight)
    const closeEnough = dist < GRANNY.catchDistance && Math.abs(eye - (this.position.y + GRANNY.height)) < 2.2
    if (closeEnough && this.state === AIState.CHASE && this.spotTime > GRANNY.reactTime) {
      this.bus?.emit('granny:catch', { distance: dist })
    }
  }

  random() {
    return Math.random()
  }

  /** Perigo 0..1 para o HUD/áudio de tensão. */
  get danger() {
    if (this.state === AIState.CHASE) return 1
    const dist = this.lastKnownPlayer
      ? Math.hypot(this.lastKnownPlayer.x - this.position.x, this.lastKnownPlayer.z - this.position.z)
      : 99
    return Math.max(0.25, 1 - Math.min(1, dist / 14))
  }

  debugLines(scene) {
    // Um tracejado do jogador até a Granny quando visível — só com ?debug=1.
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xff5a4a, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.8 }))
    line.computeLineDistances()
    scene.add(line)
    return line
  }
}
