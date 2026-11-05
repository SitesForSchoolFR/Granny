import { DEFAULT_BINDINGS } from '../core/config.js'

/**
 * Teclado + mouse + Pointer Lock. Não sabe nada de jogo: só entrega
 * "ação X está pressionada / acabou de apertar / delta de mouse".
 *
 * Pointer Lock é a escolha da Parte 1 (seção 2) porque não existe
 * middleware de câmera em FP no navegador — e porque exige gesto do usuário
 * (o menu principal é o que ganha esse clique).
 */
export class InputManager {
  /** @param {{canvas: HTMLCanvasElement, bindings?: object, bus?: object}} opts */
  constructor({ canvas, bindings = DEFAULT_BINDINGS, bus }) {
    this.canvas = canvas
    this.bus = bus ?? null
    this.bindings = bindings
    /** @type {Map<string, string[]>} action -> codes */
    this.actionCodes = new Map(Object.entries(bindings))
    /** @type {Set<string>} */
    this.pressed = new Set()
    /** @type {Set<string>} ações apertadas desde o último frame */
    this.justPressed = new Set()
    /** @type {Set<string>} ações soltas desde o último frame */
    this.justReleased = new Set()
    this.mouse = { x: 0, y: 0, locked: false }
    this.delta = { x: 0, y: 0 }
    this.sensitivity = 1
    this.invertY = false
    /** Bloqueia input de jogo (menu aberto, cutscene, puzzle digitando). */
    this.locked = false
    this.touch = { active: false }
    this.#bind()
  }

  #bind() {
    this._onKeyDown = (e) => {
      if (e.repeat) return
      const action = this.#actionFor(e.code)
      if (!action) return
      if (this.locked && action !== 'pause') return
      // Tab e Space têm comportamento nativo feio (foco/scroll) num jogo.
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
      if (this.pressed.has(action)) return
      this.pressed.add(action)
      this.justPressed.add(action)
      this.bus?.emit('input:pressed', { action })
    }
    this._onKeyUp = (e) => {
      const action = this.#actionFor(e.code)
      if (!action) return
      this.pressed.delete(action)
      this.justReleased.add(action)
    }
    this._onMouseMove = (e) => {
      if (!this.mouse.locked) return
      this.delta.x += e.movementX || 0
      this.delta.y += e.movementY || 0
    }
    // Mouse0 no binding de `interact` (doc §2: "E (ou clique esquerdo)").
    // Sem binding, cai no nome cru (mouseLeft/mouseRight) como antes.
    this._mouseAction = (button) => {
      const code = button === 2 ? 'Mouse2' : button === 1 ? 'Mouse1' : 'Mouse0'
      const bound = this.#actionFor(code)
      return bound ?? (button === 2 ? 'mouseRight' : 'mouseLeft')
    }
    this._onMouseDown = (e) => {
      if (!this.mouse.locked) return
      const a = this._mouseAction(e.button)
      if (this.locked) return
      if (this.pressed.has(a)) return
      this.pressed.add(a)
      this.justPressed.add(a)
    }
    this._onMouseUp = (e) => {
      const a = this._mouseAction(e.button)
      this.pressed.delete(a)
      this.justReleased.add(a)
    }
    this._onContext = (e) => e.preventDefault()
    this._onBlur = () => {
      this.pressed.clear()
    }
    this._onLockChange = () => {
      this.mouse.locked = document.pointerLockElement === this.canvas
      this.bus?.emit('input:lockchange', { locked: this.mouse.locked })
      if (!this.mouse.locked) this.pressed.clear()
    }

    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    window.addEventListener('blur', this._onBlur)
    document.addEventListener('pointerlockchange', this._onLockChange)
    this.canvas.addEventListener('mousemove', this._onMouseMove)
    this.canvas.addEventListener('mousedown', this._onMouseDown)
    this.canvas.addEventListener('mouseup', this._onMouseUp)
    this.canvas.addEventListener('contextmenu', this._onContext)
  }

  #actionFor(code) {
    for (const [action, codes] of this.actionCodes) if (codes.includes(code)) return action
    return null
  }

  /** @returns {Promise<boolean>} true se o lock pegou */
  async requestLock() {
    if (this.mouse.locked) return true
    try {
      await this.canvas.requestPointerLock()
      return true
    } catch (err) {
      console.warn('[input] pointer lock recusado:', err?.message ?? err)
      return false
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  isDown(action) {
    return this.pressed.has(action)
  }

  wasPressed(action) {
    return this.justPressed.has(action)
  }

  wasReleased(action) {
    return this.justReleased.has(action)
  }

  /** Eixo -1..1 do teclado para um par de ações. */
  axis(neg, pos) {
    return (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0)
  }

  /** Consome o delta de mouse acumulado no frame (chamado uma vez por tick). */
  consumeMouseDelta(target) {
    target.x = this.delta.x * this.sensitivity
    target.y = this.delta.y * this.sensitivity * (this.invertY ? -1 : 1)
    this.delta.x = 0
    this.delta.y = 0
    return target
  }

  /** Chamado no fim do frame. */
  endFrame() {
    this.justPressed.clear()
    this.justReleased.clear()
  }

  rebind(action, codes) {
    this.actionCodes.set(action, [...codes])
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('blur', this._onBlur)
    document.removeEventListener('pointerlockchange', this._onLockChange)
    this.canvas.removeEventListener('mousemove', this._onMouseMove)
    this.canvas.removeEventListener('mousedown', this._onMouseDown)
    this.canvas.removeEventListener('mouseup', this._onMouseUp)
    this.canvas.removeEventListener('contextmenu', this._onContext)
  }
}
