import * as THREE from 'three'
import { GAME, HOUSE, QUALITY } from './config.js'

/**
 * Envolve renderer/camera/clock e roda o loop com tick FIXO para simulação.
 * Física e IA em passo fixo = comportamento determinístico independente de FPS
 * (importante: em laptop fraco no Pages, o jogo não fica "mais fácil").
 */
export class Engine {
  /**
   * @param {{ canvas: HTMLCanvasElement, scene?: THREE.Scene, quality?: keyof typeof QUALITY }} opts
   */
  constructor({ canvas, scene, quality = 'medium' }) {
    this.canvas = canvas
    this.scene = scene ?? new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(HOUSE.fogColor, HOUSE.fogDensity)
    this.scene.background = new THREE.Color(HOUSE.fogColor)

    this.camera = new THREE.PerspectiveCamera(74, 1, 0.05, 90)
    this.camera.rotation.order = 'YXZ' // yaw/pitch sem gimbal weirdness

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      // preserveDrawingBuffer=false: deixa o browser otimizar o swap.
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = QUALITY[quality].shadows
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.clock = new THREE.Clock()
    this.accumulator = 0
    this.running = false
    /** @type {((dt:number)=>void)|null} */
    this.onFixedUpdate = null
    /** @type {((dt:number, alpha:number)=>void)|null} */
    this.onRender = null

    this.frame = 0
    this.fps = 0
    this._fpsSamples = 0
    this._fpsTime = 0
    this.qualityName = quality
    this._resizeHandlers = []

    this.resize = this.resize.bind(this)
    window.addEventListener('resize', this.resize)
    // Visibilidade: aba em background não pode queimar CPU nem "simular" o Granny.
    this._onVisibility = () => {
      if (document.hidden && this.running) this.clock.getDelta()
    }
    document.addEventListener('visibilitychange', this._onVisibility)
    this.resize()
  }

  setQuality(name) {
    const q = QUALITY[name] ?? QUALITY.medium
    this.qualityName = QUALITY[name] ? name : 'medium'
    this.renderer.shadowMap.enabled = q.shadows
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatioCap))
    this.resize()
    this.scene.fog = q.fog ? (this.scene.fog ?? new THREE.FogExp2(HOUSE.fogColor, HOUSE.fogDensity)) : null
    if (this.scene.fog) this.scene.fog.density = HOUSE.fogDensity
  }

  get maxAnisotropy() {
    return this.renderer.capabilities.getMaxAnisotropy()
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    const q = QUALITY[this.qualityName] ?? QUALITY.medium
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatioCap))
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(1, h)
    // FOV um pouco maior agachado: compensa a sensação de confinamento.
    this.camera.updateProjectionMatrix()
  }

  onResize(fn) {
    this._resizeHandlers.push(fn)
    this._resizeHandlers.length > 1 &&
      console.warn('[engine] mais de um onResize registrado')
    return () => {
      const i = this._resizeHandlers.indexOf(fn)
      if (i >= 0) this._resizeHandlers.splice(i, 1)
    }
  }

  start() {
    if (this.running) return
    this.running = true
    this.clock.start()
    this.clock.getDelta() // descarta o delta acumulado antes do start
    this.renderer.setAnimationLoop(() => this.step())
  }

  stop() {
    this.running = false
    this.renderer.setAnimationLoop(null)
  }

  step() {
    const raw = Math.min(this.clock.getDelta(), 0.25) // anti-espiral após aba dormindo
    this.accumulator += raw

    let steps = 0
    while (this.accumulator >= GAME.fixedDt && steps < GAME.maxSubSteps) {
      this.onFixedUpdate?.(GAME.fixedDt)
      this.accumulator -= GAME.fixedDt
      steps += 1
    }
    if (steps === GAME.maxSubSteps) this.accumulator = 0

    const alpha = this.accumulator / GAME.fixedDt
    this.onRender?.(raw, alpha)
    this.renderer.render(this.scene, this.camera)

    this.frame += 1
    this._fpsSamples += 1
    this._fpsTime += raw
    if (this._fpsTime >= 0.5) {
      this.fps = Math.round(this._fpsSamples / this._fpsTime)
      this._fpsSamples = 0
      this._fpsTime = 0
    }
  }

  dispose() {
    this.stop()
    window.removeEventListener('resize', this.resize)
    document.removeEventListener('visibilitychange', this._onVisibility)
    this.renderer.dispose()
  }
}
