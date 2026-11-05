/**
 * Renderizador de emergência em 2D — planta baixa vista de cima.
 *
 * Existe por um motivo prático: em console (Xbox, smart TV) ou num navegador
 * com WebGL desligado, o jogo não pode simplesmente morrer numa tela de erro.
 * Sem contexto 3D, desenhamos a própria grade do floor plan num canvas 2D —
 * é a MESMA fonte de verdade da colisão, então o que o jogador vê é o que o
 * jogo simula. Dá para jogar: andar, abrir porta, revistar, ouvir e fugir.
 *
 * Regra de ouro deste arquivo: `draw()` recebe o contexto por parâmetro e não
 * toca em `document`. Assim o smoke test desenha com um contexto falso.
 */

const COLORS = {
  void: '#05060a',
  floor: '#1b1712',
  wall: '#4a3f33',
  doorOpen: '#2f5d3a',
  doorClosed: '#7a4a2f',
  exit: '#c8a24a',
  poi: '#6d8fa8',
  player: '#e8e2d6',
  granny: '#b4331f',
  grid: 'rgba(232, 226, 214, 0.06)',
}

/**
 * @param {{ house: object, cell?: number }} opts
 *   house precisa expor `cells` (grade de caracteres) e `world.cellSize`.
 */
export class FallbackView {
  constructor({ house, cell = 16 } = {}) {
    this.house = house
    /** Tamanho de uma célula em pixels. */
    this.cell = cell
    this.canvas = null
    this.ctx = null
    /** Raio de visão em metros: fora disso a planta fica no escuro. */
    this.viewRadius = 9
  }

  get cols() {
    return this.house?.cells?.[0]?.length ?? 0
  }

  get rows() {
    return this.house?.cells?.length ?? 0
  }

  get width() {
    return this.cols * this.cell
  }

  get height() {
    return this.rows * this.cell
  }

  /** metros -> pixels. O mundo está em metros; a grade, em células. */
  toPixel(x, z) {
    const s = this.house?.world?.cellSize ?? 3
    return { x: (x / s) * this.cell, y: (z / s) * this.cell }
  }

  /**
   * Cria o canvas 2D e o aviso dispensável. Só aqui tocamos no DOM.
   * @param {HTMLElement} root onde montar (pai do canvas WebGL)
   * @param {{ onClose?: () => void }} [opts]
   */
  mount(root, { onClose } = {}) {
    if (typeof document === 'undefined' || !root) return null
    const canvas = document.createElement('canvas')
    canvas.id = 'fallback-view'
    canvas.className = 'fallback'
    canvas.width = this.width
    canvas.height = this.height
    root.appendChild(canvas)
    this.canvas = canvas

    const notice = document.createElement('div')
    notice.className = 'fallback-notice'
    notice.innerHTML = `
      <span>sem WebGL aqui — rodando em <strong>modo 2D</strong> (planta baixa).
      O jogo é o mesmo, a vista é de cima.</span>
      <button type="button" class="btn" id="fallback-close">entendi</button>`
    root.appendChild(notice)
    notice.querySelector('#fallback-close')?.addEventListener('click', () => {
      notice.remove()
      onClose?.()
    })
    this.notice = notice

    this.ctx = canvas.getContext('2d')
    return canvas
  }

  /**
   * Desenha um frame.
   * @param {CanvasRenderingContext2D} ctx (injetado: testável sem DOM)
   * @param {{player?:object, granny?:object, pois?:Array, doors?:Array, elapsed?:number}} state
   */
  draw(ctx, state = {}) {
    if (!ctx || !this.house?.cells) return
    const { player, granny, pois = [] } = state

    ctx.fillStyle = COLORS.void
    ctx.fillRect(0, 0, this.width, this.height)

    this.#drawCells(ctx, player)
    this.#drawPois(ctx, pois)
    if (granny) this.#drawGranny(ctx, granny)
    if (player) this.#drawPlayer(ctx, player)
  }

  /** A célula está perto o bastante do jogador para ser desenhada? */
  #visible(cx, cz, player) {
    if (!player) return true
    const s = this.house?.world?.cellSize ?? 3
    const px = player.x / s
    const pz = player.z / s
    return Math.hypot(cx + 0.5 - px, cz + 0.5 - pz) * s <= this.viewRadius
  }

  #drawCells(ctx, player) {
    const cells = this.house.cells
    for (let cz = 0; cz < cells.length; cz += 1) {
      for (let cx = 0; cx < cells[cz].length; cx += 1) {
        const ch = cells[cz][cx]
        const x = cx * this.cell
        const y = cz * this.cell
        if (ch === '#') {
          ctx.fillStyle = COLORS.wall
          ctx.fillRect(x, y, this.cell, this.cell)
          continue
        }
        if (!this.#visible(cx, cz, player)) continue
        ctx.fillStyle = COLORS.floor
        ctx.fillRect(x, y, this.cell, this.cell)
        ctx.strokeStyle = COLORS.grid
        ctx.strokeRect(x + 0.5, y + 0.5, this.cell - 1, this.cell - 1)
        if (ch === 'E') {
          ctx.fillStyle = COLORS.exit
          ctx.fillRect(x + 2, y + 2, this.cell - 4, this.cell - 4)
        }
      }
    }
    // Portas por cima: abertas = verde, fechadas = marrom.
    for (const door of this.house.doors?.values?.() ?? []) {
      const { cx, cz } = door.cell ?? this.house.world.cellOf(door.world?.x ?? 0, door.world?.z ?? 0)
      if (!this.#visible(cx, cz, player)) continue
      ctx.fillStyle = door.open ? COLORS.doorOpen : COLORS.doorClosed
      ctx.fillRect(cx * this.cell + 1, cz * this.cell + 1, this.cell - 2, this.cell - 2)
    }
  }

  #drawPois(ctx, pois) {
    for (const poi of pois) {
      const p = this.toPixel(poi.point?.x ?? poi.x ?? 0, poi.point?.z ?? poi.z ?? 0)
      ctx.fillStyle = poi.kind === 'exit' ? COLORS.exit : COLORS.poi
      ctx.beginPath()
      ctx.arc(p.x, p.y, Math.max(2, this.cell * 0.18), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  #drawGranny(ctx, granny) {
    const p = this.toPixel(granny.x ?? granny.position?.x ?? 0, granny.z ?? granny.position?.z ?? 0)
    ctx.fillStyle = COLORS.granny
    ctx.beginPath()
    ctx.arc(p.x, p.y, Math.max(3, this.cell * 0.3), 0, Math.PI * 2)
    ctx.fill()
  }

  /** Jogador = triângulo apontando para onde ele olha (yaw). */
  #drawPlayer(ctx, player) {
    const p = this.toPixel(player.x, player.z)
    const yaw = player.yaw ?? 0
    // yaw 0 olha para -Z; na tela, -Z é "para cima".
    const dx = Math.sin(yaw)
    const dz = Math.cos(yaw)
    const r = Math.max(4, this.cell * 0.42)
    ctx.fillStyle = COLORS.player
    ctx.beginPath()
    ctx.moveTo(p.x + dx * r, p.y + dz * r)
    ctx.lineTo(p.x - dz * r * 0.55 - dx * r * 0.4, p.y + dx * r * 0.55 - dz * r * 0.4)
    ctx.lineTo(p.x + dz * r * 0.55 - dx * r * 0.4, p.y - dx * r * 0.55 - dz * r * 0.4)
    ctx.closePath()
    ctx.fill()
  }
}
