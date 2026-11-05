import { DIFFICULTY, GAME, HOUSE, QUALITY, SAVE } from './config.js'
import { Engine } from './Engine.js'
import { EventBus, Ev } from './events.js'
import { GameState, StateMachine } from './state.js'
import { AssetLoader } from './AssetLoader.js'
import { House } from '../world/House.js'
import { NavGrid } from '../ai/NavGrid.js'
import { GrannyAI, AIState } from '../ai/GrannyAI.js'
import { InputManager } from '../player/InputManager.js'
import { PlayerController } from '../player/PlayerController.js'
import { Inventory } from '../player/Inventory.js'
import { NoiseSystem } from '../systems/NoiseSystem.js'
import { PuzzleSystem } from '../systems/PuzzleSystem.js'
import { ITEMS } from '../systems/items.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { AudioSystem } from '../audio/AudioSystem.js'
import { HUD } from '../ui/HUD.js'
import { Menus } from '../ui/Menus.js'
import { STR } from '../ui/strings.js'

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
    this.inventory = new Inventory({ bus: this.bus })
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
  async boot() {
    this.sm.go(GameState.LOADING)
    this.audio.ensureContext() // cria o contexto (suspenso) para o loader decodificar .mp3/.ogg
    this.assets.audioContext = this.audio.ctx ?? null
    await this.assets.load()
    this.house.build()
    this.engine.scene.add(this.house.group)
    this.house.attachPlayerLight(this.engine.camera)
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
    this.engine.start()
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
    canvas.addEventListener('click', () => {
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

  #updateFocus() {
    const eye = this.player.eye.clone()
    const view = { x: eye.x, y: eye.y, z: eye.z, yaw: this.player.yaw }
    let best = null
    let bestDist = Infinity
    for (const poi of this.house.pois) {
      const f = poi.isFocused(view)
      if (f && f.dist < bestDist) {
        best = poi
        bestDist = f.dist
      }
    }
    if (best !== this.focusedPoi) {
      this.focusedPoi = best
      this.bus.emit(Ev.POI_FOCUS, { poi: best })
    }
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
    if (input.wasPressed('lantern')) this.#toggleLantern()
    if (input.wasPressed('map')) this.#showWhereabouts()
  }

  #listInventory() {
    if (this.inventory.size === 0) return this.hud.toast('inventário vazio', 'info')
    this.hud.toast(`inventário: ${this.inventory.slots.map((s) => s.label).join(', ')}`, 'info')
  }

  /** Usa o primeiro item "usável" da mochila (Parte 4 expande as receitas). */
  #useItem() {
    const slot = this.inventory.slots.find((s) => ITEMS[s.id]?.usable)
    if (!slot) return this.hud.toast('nada para usar agora', 'info')
    if (slot.id === 'flashlight') {
      this.player.setLantern(true)
      return this.hud.toast('lanterna acesa', 'good')
    }
    return this.hud.toast(`${slot.label}: ainda não tem utilidade`, 'info')
  }

  #dropItem() {
    const slot = this.inventory.slots.at(-1)
    if (!slot) return this.hud.toast('nada para largar', 'info')
    this.inventory.remove(slot.id)
    this.hud.toast(`largou: ${slot.label}`, 'info')
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
    if (res.noise > 0) this.noise.emit({ position: poi.point, loudness: res.noise, type: res.sound ?? 'interact', source: 'player' })
    if (res.sound) this.audio.play(res.sound, { position: poi.point, gain: 0.5 + res.noise * 0.4 })
    this.bus.emit(Ev.POI_INTERACT, { poi: poi.id, ...res })
    if (res.message) this.hud.toast(res.message, res.ok ? 'good' : 'warn')
    if (res.escape) this.sm.go(GameState.WIN)
  }

  onCaught() {
    if (this.catchCooldown > 0 || this.sm.current !== GameState.PLAYING) return
    this.catchCooldown = 2
    this.attemptsMade += 1
    this.attemptsLeft -= 1
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
    if (fresh) {
      this.attemptsMade = 0
      this.runSeconds = 0
      this.inventory.clear()
      this.noise.reset()
    }
    this.puzzles.beginRun({ pois: this.house.pois, itemCount: diff.itemCount, exitLocked: true })
    this.hud.setLives(this.attemptsLeft, diff.maxCaught)
    this.hud.setObjectives(this.puzzles.progress())
    this.respawn({ keepProgress: !fresh })
    this.granny.spawn(this.house.spawn.granny)
    this.sm.go(GameState.PLAYING)
    this.setQuality(this.settings.quality)
  }

  respawn({ keepProgress = true } = {}) {
    void keepProgress
    this.player.spawn(this.house.spawn.player, HOUSE.spawnYaw)
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

  /** Empurra os multiplicadores da dificuldade para a IA (Parte 3 afina). */
  applyDifficulty() {
    const diff = DIFFICULTY[this.settings.difficulty] ?? DIFFICULTY.normal
    Object.assign(this.granny.scale, {
      sight: diff.grannySightScale,
      chase: diff.grannyChaseScale,
      hearing: diff.hearingScale,
    })
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
