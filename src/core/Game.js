import * as THREE from 'three'
import { DIFFICULTY, GAME, HOUSE, NOISE_RADIUS, PLAYER, QUALITY, SAVE } from './config.js'
import { Engine } from './Engine.js'
import { EventBus, Ev } from './events.js'
import { GameState, StateMachine } from './state.js'
import { AssetLoader } from './AssetLoader.js'
import { House } from '../world/House.js'
import { POI } from '../world/POI.js'
import { NavGrid } from '../ai/NavGrid.js'
import { GrannyAI, AIState } from '../ai/GrannyAI.js'
import { InputManager } from '../player/InputManager.js'
import { PlayerController } from '../player/PlayerController.js'
import { Inventory } from '../player/Inventory.js'
import { NoiseSystem } from '../systems/NoiseSystem.js'
import { PuzzleSystem } from '../systems/PuzzleSystem.js'
import { ITEMS, itemLabel } from '../systems/items.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { AudioSystem } from '../audio/AudioSystem.js'
import { HUD } from '../ui/HUD.js'
import { Menus } from '../ui/Menus.js'
import { STR } from '../ui/strings.js'
import { FallbackView } from '../ui/FallbackView.js'

/** PRNG com seed — `?seed=123` deixa um run reproduzível (debug de regressão). */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Orquestrador: monta os sistemas, registra os handlers dos sete estados e
 * faz o cross-wiring (player → noise → AI → HUD). Nenhum módulo de jogo se
 * importa em outro módulo de jogo: tudo passa por aqui ou pelo EventBus.
 */
export class Game {
  /** @param {{canvas: HTMLElement, hudRoot: HTMLElement, screensRoot: HTMLElement, params: URLSearchParams}} opts */
  constructor({ canvas, hudRoot, screensRoot, params }) {
    // Guardamos o canvas: #wire() precisa dele e o parâmetro do construtor
    // sai de escopo. Foi exatamente esse descuido que derrubou o jogo com
    // "canvas is not defined" dentro do construtor (fora de qualquer promise).
    this.canvas = canvas
    this.params = params
    this.debug = params.get('debug') === '1'
    this.seed = Number(params.get('seed') ?? Date.now() % 100000)
    this.rng = mulberry32(this.seed)

    this.bus = new EventBus()
    this.bus.setDebug(this.debug)

    this.settings = {
      difficulty: params.get('diff') ?? 'normal',
      quality: params.get('quality') ?? (window.devicePixelRatio > 1.5 ? 'medium' : 'low'),
      volumes: { master: 0.9, sfx: 0.9, ambience: 0.5 },
      sensitivity: 1,
      invertY: false,
      lanternStart: false,
      hasSave: false,
      /** Multiplicador de brilho (a casa estava escura demais no console). */
      brightness: 1,
    }
    if (!DIFFICULTY[this.settings.difficulty]) this.settings.difficulty = 'normal'

    this.assets = new AssetLoader({ bus: this.bus })
    this.engine = new Engine({ canvas, quality: this.settings.quality })
    this.assets.renderer = this.engine.renderer
    this.house = new House({ assets: this.assets })
    /** Colisão é a grade da casa — um único objeto compartilhado por player e IA. */
    this.world = this.house.world
    this.audio = new AudioSystem({ bus: this.bus, assets: this.assets })
    this.noise = new NoiseSystem({ bus: this.bus })
    // Uma mão só: dá para segurar 1 item por vez (pedido do criador).
    this.inventory = new Inventory({ bus: this.bus, max: 1 })
    this.save = new SaveSystem()
    this.puzzles = new PuzzleSystem({ bus: this.bus, house: this.house, inventory: this.inventory, rng: this.rng })
    this.input = new InputManager({ canvas, bus: this.bus })
    this.player = new PlayerController({
      camera: this.engine.camera,
      world: this.world,
      input: this.input,
      bus: this.bus,
      noise: this.noise,
      audio: this.audio,
      onLantern: (on) => this.house.setLantern(on),
    })
    this.nav = null
    this.granny = null
    this.hud = new HUD({ root: hudRoot, bus: this.bus })
    this.menus = new Menus({ root: screensRoot, on: (a, v) => this.menuAction(a, v), state: this.settings })

    this.elapsed = 0
    this.runSeconds = 0
    this.attemptsLeft = GAME.maxCaught
    this.attemptsMade = 0
    this.focusedPoi = null
    /** @type {object|null} porta sob a mira (doc Parte 2 §6). */
    this.focusedDoor = null
    /** Itens soltos no chão (arremessados/largados). */
    this.dropped = []
    this.droppedCount = 0
    /** Normal: o "dia extra" só pode acontecer uma vez por run. */
    this.extraDayUsed = false
    this.catchCooldown = 0
    this.lastNoise = null
    this.running = false
    this.context = {
      game: this,
      bus: this.bus,
      settings: this.settings,
      inventory: this.inventory,
    }
    this.sm = new StateMachine({ bus: this.bus, ctx: this.context, handlers: this.#handlers() })

    this.#wire()
  }

  // ───────────────────────────────────────────────────────── boot
  /**
   * Marca a etapa atual do boot. Vai para `window.__escapeHouse.stage`, que o
   * vigia inline do index.html mostra na tela: em console de videogame nao da
   * para abrir o console, entao o diagnostico tem que caber no HTML.
   */
  #stage(name) {
    if (typeof window !== 'undefined' && window.__escapeHouse) window.__escapeHouse.stage = name
    this.menus?.setLabel?.(`carregando ${name}…`)
    console.info(`[escape-house] boot: ${name}`)
  }

  async boot() {
    this.#stage('iniciando')
    this.sm.go(GameState.LOADING)
    this.#stage('áudio')
    this.audio.ensureContext() // cria o contexto (suspenso) para o loader decodificar .mp3/.ogg
    this.assets.audioContext = this.audio.ctx ?? null
    this.#stage('assets')
    await this.assets.load()
    this.#stage('casa')
    this.house.build()
    this.engine.scene.add(this.house.group)
    this.house.attachPlayerLight(this.engine.camera)
    this.#stage('navegação')
    this.nav = new NavGrid(this.house)
    this.granny = new GrannyAI({
      world: this.world,
      nav: this.nav,
      house: this.house,
      noise: this.noise,
      bus: this.bus,
      audio: this.audio,
      scale: difficultyScale(this.settings.difficulty),
    })
    this.engine.scene.add(this.granny.object3D)
    this.granny.spawn(this.house.spawn.granny)
    this.player.spawn(this.house.spawn.player, HOUSE.spawnYaw)

    this.settings.hasSave = !!this.save.load()
    this.hud.setDebug(this.debug)
    if (this.debug) this.grannyLine = this.granny.debugLines(this.engine.scene)

    // Câmera de fundo do menu: um giro lento pelo corredor.
    this.engine.onRender = (dt, alpha) => this.onRender(dt, alpha)
    this.engine.onFixedUpdate = (dt) => this.onFixedUpdate(dt)
    this.#stage('motor')
    this.engine.start()
    if (this.engine.headless) this.#mountFallback()
    this.#stage('menu')
    this.sm.go(GameState.MENU)
    console.info('[escape-house] seed', this.seed, '| house', this.house.describe(), '| assets', this.assets.stats())
  }

  #handlers() {
    const G = GameState
    return {
      [G.MENU]: {
        update: (dt) => {
          this.engine.camera.position.set(0, 2.1, -2)
          this.engine.camera.rotation.set(-0.12, this.elapsed * 0.08, 0, 'YXZ')
          this.house.update(dt, this.elapsed)
        },
        onEnter: () => {
          this.input.locked = true
          this.input.exitLock()
          this.menus.show('MENU')
        },
        onExit: () => {
          this.input.locked = false
          this.menus.hide()
        },
      },
      [G.LOADING]: {
        onEnter: () => this.menus.setLoading(0, STR.loading[0]),
      },
      [G.PLAYING]: {
        update: (dt) => this.simulate(dt),
        onEnter: () => {
          this.hud.setEnabled(true)
          void this.input.requestLock()
          void this.audio.resume()
        },
        onExit: () => {
          this.input.exitLock()
        },
      },
      [G.PAUSED]: {
        onEnter: () => {
          this.menus.show('PAUSED')
          this.input.exitLock()
        },
        onExit: () => this.menus.hide(),
      },
      [G.CAUGHT]: {
        onEnter: (ctx, from) => {
          this.input.exitLock()
          this.menus.show('CAUGHT', { attemptsLeft: this.attemptsLeft, max: GAME.maxCaught })
          this.saveRun('caught')
          void from
        },
        onExit: () => this.menus.hide(),
      },
      [G.WIN]: {
        onEnter: () => {
          this.input.exitLock()
          this.menus.show('WIN', { seconds: this.runSeconds, attempts: this.attemptsMade })
          this.save.clear()
          this.settings.hasSave = false
        },
      },
      [G.LOSE]: {
        onEnter: () => {
          this.input.exitLock()
          this.menus.show('LOSE', { seconds: this.runSeconds })
          this.save.clear()
          this.settings.hasSave = false
        },
      },
    }
  }

  #wire() {
    this.bus.on(Ev.LOADING_PROGRESS, ({ progress, label }) => {
      this.menus.setLoading(progress, label ? `carregando ${label}` : 'carregando…')
    })
    this.bus.on(Ev.LOADING_DONE, () => this.menus.hideLoading())

    this.bus.on('granny:catch', () => this.onCaught())
    // Clique no canvas re-trava o mouse (Chrome recusa requestPointerLock logo
    // depois do Esc; um clique do usuário é sempre um gesto válido).
    this.canvas?.addEventListener('click', () => {
      if (this.sm.current === GameState.PLAYING && !this.input.mouse.locked) void this.input.requestLock()
    })

    this.bus.on('input:lockchange', ({ locked }) => {
      // Perder o mouse-look = pausa. Sem isso o jogador fica "cego" no menu do SO.
      if (!locked && this.sm.current === GameState.PLAYING) this.sm.go(GameState.PAUSED)
      if (locked && this.sm.current === GameState.PAUSED) this.sm.go(GameState.PLAYING)
    })

    this.bus.on(Ev.NOISE_EMIT, (n) => {
      if (n.source === 'player') this.lastNoise = n
      if (this.audio.ready && n.type === 'door') this.audio.creak(n, 0.35 + n.loudness * 0.4)
    })
  }

  // ─────────────────────────────────────────────────────── run loop
  onFixedUpdate(dt) {
    this.elapsed += dt
    this.sm.update(dt)
    this.noise.update(dt)
    if (this.catchCooldown > 0) this.catchCooldown -= dt
  }

  simulate(dt) {
    this.runSeconds += dt
    this.player.update(dt)
    this.granny.update(dt, this.player)
    this.house.update(dt, this.elapsed)
    this.#updateFocus()
    this.#handleActions()
    if (this.sm.current !== GameState.PLAYING) return
    this.audio.setTension(this.granny.state === AIState.CHASE ? 1 : Math.min(0.6, 1 / (1 + this.distanceToGranny() / 6)))
  }

  onRender(dt) {
    // Sem isto, `wasPressed()` continua true em todos os frames seguintes: um
    // toque em E interagiria 60x por segundo. Limpa no fim do frame, depois de
    // todos os passos fixos já terem lido o input.
    this.input.endFrame()
    this.audio.syncListener(this.engine.camera)
    this.audio.update(dt)
    for (const poi of this.house.pois) poi.update(dt, this.elapsed)
    this.hud.renderFrame({
      danger: this.sm.current === GameState.PLAYING ? this.granny.danger : 0,
      noiseMeter: this.noise.meter,
      lastNoiseAngle: this.#noiseBearing(),
      debugText: this.debug ? this.debugText() : '',
    })
    if (this.grannyLine) {
      const a = this.grannyLine.geometry.attributes.position
      a.setXYZ(0, this.granny.position.x, 1.4, this.granny.position.z)
      a.setXYZ(1, this.player.position.x, 1.4, this.player.position.z)
      a.needsUpdate = true
      this.grannyLine.computeLineDistances()
      this.grannyLine.visible = this.sm.current === GameState.PLAYING
    }
    if (this.fallback?.ctx) {
      this.fallback.draw(this.fallback.ctx, {
        player: { x: this.player.position.x, z: this.player.position.z, yaw: this.player.yaw },
        granny: { x: this.granny.position.x, z: this.granny.position.z },
        pois: this.house.pois,
      })
    }
  }

  /**
   * Sem WebGL: monta a vista 2D da planta no lugar do canvas 3D.
   * O jogo continua jogável — só muda o ponto de vista.
   */
  #mountFallback() {
    try {
      this.fallback = new FallbackView({ house: this.house })
      this.fallback.mount(this.canvas?.parentElement ?? document.body)
      this.canvas?.setAttribute('hidden', '')
      this.hud.toast(STR.noWebGL.toast, 'warn')
      console.warn('[escape-house] modo 2D (planta baixa): WebGL indisponível')
    } catch (err) {
      console.warn('[escape-house] fallback 2D falhou:', err?.message ?? err)
    }
  }

  distanceToGranny() {
    return Math.hypot(this.granny.position.x - this.player.position.x, this.granny.position.z - this.player.position.z)
  }

  #noiseBearing() {
    const n = this.lastNoise
    if (!n || this.elapsed - (n.age ?? 0) > 2.5) return null
    const dx = n.x - this.player.position.x
    const dz = n.z - this.player.position.z
    const fx = -Math.sin(this.player.yaw)
    const fz = -Math.cos(this.player.yaw)
    const rx = Math.cos(this.player.yaw)
    const rz = -Math.sin(this.player.yaw)
    return Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz)
  }

  /**
   * O que está sob a mira (doc §6: raycast do centro da tela até 2.5m).
   * POIs e portas competem; ganha o mais perto.
   */
  #updateFocus() {
    const eye = this.player.eye.clone()
    const view = { x: eye.x, y: eye.y, z: eye.z, yaw: this.player.yaw }
    const look = this.player.lookDir()

    let poi = null
    let poiDist = Infinity
    for (const p of this.house.pois) {
      const f = p.isFocused(view)
      if (f && f.dist < poiDist) {
        poi = p
        poiDist = f.dist
      }
    }

    let door = null
    let doorDist = Infinity
    for (const d of this.house.doors.values()) {
      const f = this.#doorFocus(d, eye, look)
      if (f && f.dist < doorDist) {
        door = d
        doorDist = f.dist
      }
    }

    const usePoi = poi && (!door || poiDist <= doorDist)
    const nextPoi = usePoi ? poi : null
    const nextDoor = usePoi ? null : door
    if (nextPoi !== this.focusedPoi || nextDoor !== this.focusedDoor) {
      this.focusedPoi = nextPoi
      this.focusedDoor = nextDoor
      this.bus.emit(Ev.POI_FOCUS, { poi: nextPoi, door: nextDoor })
    }
  }

  /** Porta em foco? Alcance + cone + linha de visão. */
  #doorFocus(door, eye, look) {
    const p = door.focusPoint
    const dx = p.x - eye.x
    const dy = p.y - eye.y
    const dz = p.z - eye.z
    const dist = Math.hypot(dx, dy, dz)
    // Porta é grande: um pouco mais de folga que o POI.
    if (dist > PLAYER.interactRange + 0.7) return null
    const flat = Math.hypot(dx, dz) || 1
    if ((look.x * dx + look.z * dz) / flat < 0.35) return null
    if (!this.world.hasLineOfSight(eye, p, { step: 0.45, stopShort: 0.3 })) return null
    return { dist }
  }

  /**
   * Fade-in do preto (doc §1): a run começa no escuro e clareia.
   * Feito no DOM porque o canvas 3D ainda está montando a cena.
   */
  #fadeIn(seconds = PLAYER.wakeHoldTime) {
    const node = typeof document !== 'undefined' ? document.getElementById('fade') : null
    if (!node) return
    node.style.transition = 'none'
    node.style.opacity = '1'
    window.requestAnimationFrame(() => {
      node.style.transition = `opacity ${seconds}s ease-out`
      node.style.opacity = '0'
    })
  }

  /** Abrir/fechar/destrancar uma porta (doc §6 — portas são interagíveis). */
  #interactDoor(door) {
    if (door.locked) {
      const res = door.unlockWith(this.inventory)
      if (!res.ok) {
        // Sem texto: a própria mira já diz "porta (trancada)". Só o som seco.
        this.audio.play('denied', { position: door.center, gain: 0.5 })
        this.noise.emit({ position: door.center, loudness: 0.22, radius: NOISE_RADIUS.interact, type: 'denied', source: 'player' })
        return
      }
      this.hud.toast(`${STR.prompt.unlocked}: ${itemLabel(res.item)}`, 'good')
      this.audio.play('unlock', { position: door.center, gain: 0.8 })
      this.noise.emit({ position: door.center, loudness: 0.5, type: 'unlock', source: 'player' })
      this.puzzles.solve(`door:${door.id}`)
      return
    }
    const res = door.toggle()
    if (!res.ok) {
      this.audio.play('denied', { position: door.center, gain: 0.4 })
      return
    }
    this.noise.emit({
      position: door.center,
      loudness: res.loudness,
      radius: door.creak >= 0.5 ? NOISE_RADIUS.creakyDoor : NOISE_RADIUS.door,
      type: 'door',
      source: 'player',
    })
    this.audio.play(res.open ? 'doorOpen' : 'doorClose', { position: door.center, gain: 0.7 })
    this.bus.emit(Ev.POI_INTERACT, { door: door.id, ...res })
  }

  #handleActions() {
    const input = this.input
    if (input.wasPressed('interact')) this.interact()
    if (input.wasPressed('pause')) {
      this.sm.current === GameState.PLAYING ? this.sm.go(GameState.PAUSED) : this.sm.current === GameState.PAUSED && this.sm.go(GameState.PLAYING)
    }
    if (input.wasPressed('debug')) this.hud.setDebug(!this.hud.debug)
    if (input.wasPressed('inventory')) this.#listInventory()
    if (input.wasPressed('use')) this.#useItem()
    if (input.wasPressed('drop')) this.#dropItem()
    if (input.wasPressed('throw')) this.#throwItem()
    if (input.wasPressed('lantern')) this.#toggleLantern()
    if (input.wasPressed('map')) this.#showWhereabouts()
  }

  /**
   * Inventário: sem aviso quando está vazio ou quando não há nada a fazer.
   * Regra do criador: interação que não dá em nada NÃO mostra texto — só não
   * acontece nada na tela.
   */
  #listInventory() {
    if (this.inventory.size === 0) return
    this.hud.toast(`na mão: ${this.inventory.slots.map((s) => s.label).join(', ')}`, 'info')
  }

  /** Usa o item da mão (Parte 4 expande as receitas; óleo já funciona). */
  #useItem() {
    const slot = this.inventory.slots[0]
    if (!slot) return
    if (slot.id === 'flashlight') {
      this.player.setLantern(true)
      return this.hud.toast('lanterna acesa', 'good')
    }
    if (slot.id === 'oil') return this.#useOil(slot)
  }

  /**
   * Óleo (doc §6.4): tira o rangido da tábua sob os pés, para sempre.
   * Cada frasco tem usos limitados (ITEMS.oil.uses).
   */
  #useOil(slot) {
    const board = this.world.boardAt?.(this.player.position.x, this.player.position.z)
    if (!board) return this.hud.toast('não tem nada rangendo aqui', 'info')
    this.world.silenceBoard(board)
    slot.qty -= 1
    if (slot.qty <= 0) this.inventory.remove('oil')
    this.audio.play('oil', { position: this.player.position, gain: 0.7 })
    this.noise.emit({ position: this.player.position, loudness: 0.05, radius: NOISE_RADIUS.oil, type: 'oil', source: 'player' })
    this.hud.toast('a tábua parou de ranger', 'good')
  }

  /** Larga o item no chão, aos pés (sem arremesso). */
  #dropItem() {
    this.#releaseItem({ thrown: false })
  }

  /** Espaço: ARREMESSA o item da mão (doc §6.6 — item de distração). */
  #throwItem() {
    this.#releaseItem({ thrown: true })
  }

  #releaseItem({ thrown }) {
    const slot = this.inventory.slots[0]
    if (!slot) return // mão vazia: nada na tela, sem aviso
    const id = slot.id
    const label = slot.label
    this.inventory.remove(id, 1)

    const look = this.player.lookDir()
    let x = this.player.position.x + look.x * (thrown ? 3.4 : 0.7)
    let z = this.player.position.z + look.z * (thrown ? 3.4 : 0.7)

    // Caiu no void / dentro de parede? Vai para a sala (pedido do criador).
    const cell = this.world.cellOf(x, z)
    if (this.world.isCellSolid?.(cell.cx, cell.cz)) {
      const sala = this.house.rooms.find((r) => r.id === 'living') ?? this.house.rooms[0]
      const c = this.house.cellToWorld(Math.floor((sala.x0 + sala.x1) / 2), Math.floor((sala.z0 + sala.z1) / 2))
      x = c.x
      z = c.z
    }
    const free = this.world.nearestFree(x, z, 0.35)
    this.#spawnDroppedItem(id, label, free.x, free.z)

    // Impacto: barulho no ponto onde caiu (doc §6.2 — distração 15 unidades).
    const radius = thrown ? NOISE_RADIUS.distraction : NOISE_RADIUS.drop
    this.noise.emit({
      position: { x: free.x, z: free.z },
      loudness: thrown ? 0.7 : 0.45,
      radius,
      type: thrown ? 'distraction' : 'drop',
      source: 'player',
    })
    this.audio.play(thrown ? 'drop' : 'thump', { position: { x: free.x, z: free.z }, gain: thrown ? 0.8 : 0.5 })
    if (thrown) this.hud.toast(`arremessou: ${label}`, 'info')
  }

  /** Cria um POI de item solto no chão (reaproveita a interação existente). */
  #spawnDroppedItem(id, label, x, z) {
    const poi = new POI({
      id: `dropped_${id}_${++this.droppedCount}`,
      kind: 'item',
      label,
      item: id,
      // y = 0.18: o octaedro (raio 0.13) fica APOIADO no chão, não afundado.
      point: new THREE.Vector3(x, 0.18, z),
      world: this.world,
    })
    this.house.pois.push(poi)
    this.house.group.add(poi.object3D)
    this.dropped.push(poi)
    return poi
  }

  /** Limpa os itens soltos no chão (começo de run). */
  #clearDropped() {
    for (const poi of this.dropped) {
      this.house.group.remove(poi.object3D)
      const i = this.house.pois.indexOf(poi)
      if (i >= 0) this.house.pois.splice(i, 1)
    }
    this.dropped.length = 0
  }

  #toggleLantern() {
    const on = !this.player.lanternOn
    this.player.setLantern(on)
    this.hud.toast(on ? 'lanterna acesa' : 'lanterna apagada', 'info')
  }

  #showWhereabouts() {
    const room = this.house.roomAt(this.player.position.x, this.player.position.z)
    this.hud.toast(room ? `você está na(o) ${room.label.toLowerCase()}` : 'fora da casa', 'info')
  }

  interact() {
    if (this.focusedDoor && !this.focusedPoi) return this.#interactDoor(this.focusedDoor)
    const poi = this.focusedPoi
    if (!poi) return
    const res = poi.interact({
      inventory: this.inventory,
      puzzles: this.puzzles,
      noise: this.noise,
      audio: this.audio,
      player: this.player,
      house: this.house,
      bus: this.bus,
    })
    if (res.noise > 0) {
      this.noise.emit({
        position: poi.point,
        loudness: res.noise,
        radius: NOISE_RADIUS[this.#noiseKind(res.sound)] ?? 0,
        type: res.sound ?? 'interact',
        source: 'player',
      })
    }
    // Som de pegar muda conforme o item (metal, papel, ferramenta…).
    if (res.sound === 'pickup') this.audio.pickup(res.item ?? '', poi.point)
    else if (res.sound) this.audio.play(res.sound, { position: poi.point, gain: 0.5 + res.noise * 0.4 })
    this.bus.emit(Ev.POI_INTERACT, { poi: poi.id, ...res })
    if (res.message) this.hud.toast(res.message, res.ok ? 'good' : 'warn')
    if (res.escape) this.sm.go(GameState.WIN)
  }

  onCaught() {
    if (this.catchCooldown > 0 || this.sm.current !== GameState.PLAYING) return
    this.catchCooldown = 2
    this.attemptsMade += 1
    this.attemptsLeft -= 1

    // Normal: chance de ganhar mais uma noite quando a última se esgota.
    const diff = DIFFICULTY[this.settings.difficulty] ?? DIFFICULTY.normal
    if (this.attemptsLeft <= 0 && diff.extraDayChance > 0 && !this.extraDayUsed && this.rng() < diff.extraDayChance) {
      this.extraDayUsed = true
      this.attemptsLeft = 1
      this.hud.toast('você aguenta mais uma noite…', 'good')
    }

    // Cada noite perdida derruba um pouco mais a cabeça (pedido do criador):
    // a câmera fica torta para a esquerda e balança junto com as passadas.
    this.player.setTilt(-Math.min(this.attemptsMade, 5) * 0.035)

    this.bus.emit('player:damaged', { attemptsLeft: this.attemptsLeft })
    this.audio.play('thump', { gain: 1 })
    if (this.attemptsLeft <= 0) this.sm.go(GameState.LOSE)
    else this.sm.go(GameState.CAUGHT)
  }

  // ────────────────────────────────────────────────────── run setup
  startRun({ fresh = true } = {}) {
    const diff = DIFFICULTY[this.settings.difficulty] ?? DIFFICULTY.normal
    this.applyDifficulty()
    this.attemptsLeft = diff.maxCaught
    this.#clearDropped()
    if (fresh) {
      this.attemptsMade = 0
      this.extraDayUsed = false
      this.runSeconds = 0
      this.inventory.clear()
      this.noise.reset()
      this.player.setTilt(0)
    }
    this.puzzles.beginRun({ pois: this.house.pois, itemCount: diff.itemCount, exitLocked: true })
    this.hud.setLives(this.attemptsLeft, diff.maxCaught)
    this.hud.setObjectives(this.puzzles.progress())
    this.respawn({ keepProgress: !fresh })
    this.granny.spawn(this.house.spawn.granny)
    this.sm.go(GameState.PLAYING)
    this.setQuality(this.settings.quality)
  }

  respawn({ keepProgress = true, lying = true } = {}) {
    void keepProgress
    // Doc §1: acorda deitado no quarto inicial e levanta no primeiro input.
    this.player.spawn(this.house.spawn.player, HOUSE.spawnYaw, { lying })
    if (lying) this.#fadeIn()
    this.granny.spawn(this.house.spawn.granny)
    this.noise.reset()
    this.catchCooldown = 0.8
    this.sm.go(GameState.PLAYING)
  }

  resumeSavedRun() {
    const snap = this.save.load()
    if (!snap?.state) return false
    this.startRun({ fresh: true })
    this.inventory.fromJSON(snap.state.inventory)
    this.attemptsLeft = snap.state.attemptsLeft ?? this.attemptsLeft
    this.runSeconds = snap.state.runSeconds ?? 0
    for (const id of snap.state.solved ?? []) this.puzzles.solve(id)
    this.hud.setLives(this.attemptsLeft, (DIFFICULTY[this.settings.difficulty] ?? DIFFICULTY.normal).maxCaught)
    return true
  }

  saveRun(reason = 'auto') {
    if (!this.save.available || !SAVE.autosave) return false
    const ok = this.save.save({
      attemptsLeft: this.attemptsLeft,
      attemptsMade: this.attemptsMade,
      runSeconds: Math.round(this.runSeconds),
      difficulty: this.settings.difficulty,
      inventory: this.inventory.toJSON(),
      solved: [...this.puzzles.solved],
      player: { x: +this.player.position.x.toFixed(2), z: +this.player.position.z.toFixed(2) },
      reason,
    })
    if (ok) this.settings.hasSave = true
    return ok
  }

  /** Empurra os multiplicadores e as regras da dificuldade para o mundo. */
  applyDifficulty() {
    const diff = DIFFICULTY[this.settings.difficulty] ?? DIFFICULTY.normal
    Object.assign(this.granny.scale, {
      sight: diff.grannySightScale,
      chase: diff.grannyChaseScale,
      hearing: diff.hearingScale,
    })
    // Prática: sem Granny (as aranhas ficam — doc Parte 3 §4).
    this.granny.setEnabled(diff.granny !== false)
    // Quantas tábuas rangem de verdade neste modo (Fácil 50% … Extreme 200%).
    this.house.setActiveBoards(diff.boardScale ?? 1, this.rng)
    // Extreme: todos os atalhos trancados.
    this.house.setShortcutsLocked(!!diff.lockShortcuts)
    // Fácil: sem indicador de ruído no canto — só o som avisa.
    this.hud.setNoiseVisible(diff.showNoiseHud !== false)
  }

  /** Brilho: a casa estava escura demais no console. */
  setBrightness(value) {
    this.settings.brightness = value
    this.engine.setBrightness?.(value)
    this.house.setBrightness?.(value)
  }

  /** Tipo de barulho (doc §6.2) a partir do som que o POI devolve. */
  #noiseKind(sound) {
    if (sound === 'doorOpen' || sound === 'doorClose') return 'door'
    return 'interact'
  }

  setQuality(name) {
    if (!QUALITY[name]) return
    this.settings.quality = name
    this.engine.setQuality(name)
  }

  menuAction(action, value) {
    switch (action) {
      case 'start':
        this.startRun({ fresh: true })
        break
      case 'resume-run':
        if (!this.resumeSavedRun()) this.hud.toast('save inválido — recomeçando', 'warn')
        break
      case 'retry':
        this.respawn()
        break
      case 'restart':
        this.startRun({ fresh: true })
        break
      case 'quit':
        this.saveRun('quit')
        this.sm.go(GameState.MENU)
        break
      case 'controls':
        this.menus.show('CONTROLS')
        break
      case 'options':
        this.menus.show('OPTIONS')
        break
      case 'menu-back':
        this.menus.show(this.sm.current === GameState.PAUSED ? 'PAUSED' : 'MENU')
        break
      case 'difficulty':
        if (DIFFICULTY[value]) {
          this.settings.difficulty = value
          this.applyDifficulty()
          this.menus.show('MENU')
        }
        break
      case 'quality':
        if (QUALITY[value]) this.setQuality(value)
        break
      case 'brightness':
        this.setBrightness(Number(value))
        break
      case 'volume:master':
        this.settings.volumes.master = value
        this.audio.setVolume('master', value)
        break
      case 'volume:ambience':
        this.settings.volumes.ambience = value
        this.audio.setVolume('ambience', value)
        break
      case 'sensitivity':
        this.settings.sensitivity = value
        this.input.sensitivity = value
        break
      case 'invertY':
        this.settings.invertY = value === '1'
        this.input.invertY = this.settings.invertY
        break
      case 'lanternStart':
        this.settings.lanternStart = value === '1'
        break
      case 'clear-save':
        this.save.clear()
        this.settings.hasSave = false
        this.menus.show('OPTIONS')
        break
      default:
        break
    }
  }

  debugText() {
    const st = this.sm.current ?? '∅'
    const lines = [
      `ESCAPE HOUSE  ${GAME.version}   [${st}]   ${this.engine.fps} fps`,
      `seed ${this.seed} · run ${this.runSeconds.toFixed(1)}s · capturas ${this.attemptsMade}`,
      `player ${JSON.stringify(this.player.snapshot())}`,
      `granny ${this.granny?.state ?? '-'}  d=${this.distanceToGranny().toFixed(1)}m  throttle=${(this.granny?.throttle ?? 0).toFixed(2)}`,
      `world ${JSON.stringify(this.world.stats)}  house ${JSON.stringify(this.house.describe())}`,
      `assets ${JSON.stringify(this.assets.stats())}  save ${JSON.stringify(this.save.describe())}`,
      `noise level ${this.noise.meter.toFixed(2)} · total ${this.noise.total}`,
    ]
    if (this.bus.debug) {
      lines.push('── eventos ──')
      for (const e of this.bus.log.slice(-7)) lines.push(`  ${e.type}`)
    }
    return lines.join('\n')
  }
}

/** Dificuldade -> multiplicadores da IA. Fica fora da classe para o smoke test. */
export function difficultyScale(name) {
  const diff = DIFFICULTY[name] ?? DIFFICULTY.normal
  return { sight: diff.grannySightScale, chase: diff.grannyChaseScale, hearing: diff.hearingScale }
}
