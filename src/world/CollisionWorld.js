import { HOUSE } from '../core/config.js'

/**
 * Colisão manual por AABB + grade espacial (decisão da Parte 1, seção 2).
 * Veja docs/DECISOES.md: canônica para uma casa em grade é mais leve que
 * carregar cannon-es (~40 kB gzip) por um cenário sem corpo dinâmico.
 *
 * Convenções:
 *  - origem do mundo no centro do floor plan; Y para cima;
 *  - o jogador/Granny são cilindros verticais (raio + altura) — sem rotação;
 *  - "step": o jogador sobe desníveis até `stepHeight` sem precisar de pulo.
 */
export class CollisionWorld {
  /** @param {{ cellSize?: number, maxHeight?: number }} [options] */
  constructor({ cellSize = HOUSE.cell, maxHeight = HOUSE.wallHeight } = {}) {
    this.cellSize = cellSize
    this.maxHeight = maxHeight
    /** @type {Array<{min:THREE.Vector3-like,max:object,tag:string,enabled:boolean}>} */
    this.boxes = []
    /** @type {Map<string, Set<number>>} célula -> índices de boxes */
    this.grid = new Map()
    /** Células marcadas como sólidas no floor plan (paredes fixas). */
    /** @type {Set<string>} */
    this.solidCells = new Set()
    /** @type {Array<{cx:number,cz:number,loudness:number,type?:string}>} */
    this.boards = []
    this.dirty = true
    this.stats = { boxes: 0, solidCells: 0 }
    /** Limites da planta em células — fora disso é tratado como parede. */
    /** @type {{w:number,h:number}|null} */
    this.bounds = null
  }

  key(cx, cz) {
    return `${cx},${cz}`
  }

  cellOf(x, z) {
    const s = this.cellSize
    return { cx: Math.floor(x / s), cz: Math.floor(z / s) }
  }

  /** Adiciona um AABB pelo centro e meia-extensão. @returns {number} id */
  addBox(center, half, tag = 'prop') {
    const box = {
      tag,
      enabled: true,
      min: { x: center.x - half.x, y: center.y - half.y, z: center.z - half.z },
      max: { x: center.x + half.x, y: center.y + half.y, z: center.z + half.z },
    }
    const id = this.boxes.length
    this.boxes.push(box)
    this.dirty = true
    return id
  }

  setBoxEnabled(id, enabled) {
    const box = this.boxes[id]
    if (!box || box.enabled === enabled) return false
    box.enabled = enabled
    this.dirty = true
    return true
  }

  /**
   * Marca uma célula como "tábua barulhenta" (doc Parte 2 §4).
   * Pisar aqui denuncia o jogador mesmo agachado.
   */
  addBoard(cx, cz, loudness = 0.85, type = 'board') {
    this.boards.push({ cx, cz, loudness, type })
    return this.boards.length - 1
  }

  /** Recomeça a lista de tábuas (mudança de dificultade). */
  clearBoards() {
    this.boards.length = 0
  }

  /**
   * Óleo (doc §6.4): a tábua para de ranger PARA SEMPRE nesta run.
   * @param {{cx:number,cz:number}} board
   * @returns {boolean} true se realmente existia e foi silenciada
   */
  silenceBoard(board) {
    if (!board) return false
    const i = this.boards.indexOf(board)
    if (i < 0) return false
    this.boards.splice(i, 1)
    return true
  }

  /** @returns {{cx:number,cz:number,loudness:number,type?:string}|null} */
  boardAt(x, z) {
    if (this.boards.length === 0) return null
    const { cx, cz } = this.cellOf(x, z)
    return this.boards.find((b) => b.cx === cx && b.cz === cz) ?? null
  }

  markSolid(cx, cz, solid) {
    const k = this.key(cx, cz)
    if (solid) this.solidCells.add(k)
    else this.solidCells.delete(k)
    this.dirty = true
  }

  isCellSolid(cx, cz) {
    if (this.bounds && (cx < 0 || cz < 0 || cx >= this.bounds.w || cz >= this.bounds.h)) return true
    return this.solidCells.has(this.key(cx, cz))
  }

  rebuild() {
    if (!this.dirty) return
    this.grid.clear()
    const s = this.cellSize
    for (let i = 0; i < this.boxes.length; i += 1) {
      const b = this.boxes[i]
      if (!b.enabled) continue
      const x0 = Math.floor(b.min.x / s)
      const x1 = Math.floor(b.max.x / s)
      const z0 = Math.floor(b.min.z / s)
      const z1 = Math.floor(b.max.z / s)
      for (let cx = x0; cx <= x1; cx += 1) {
        for (let cz = z0; cz <= z1; cz += 1) {
          const k = this.key(cx, cz)
          let set = this.grid.get(k)
          if (!set) {
            set = new Set()
            this.grid.set(k, set)
          }
          set.add(i)
        }
      }
    }
    this.dirty = false
    this.stats.boxes = this.boxes.filter((b) => b.enabled).length
    this.stats.solidCells = this.solidCells.size
  }

  /** @param {number} x @param {number} z @param {number} y */
  isBlocked(x, z, y = 1.2) {
    this.rebuild() // no-op se nada mudou; sem isso a consulta vê uma grade vazia
    const { cx, cz } = this.cellOf(x, z)
    // isCellSolid já trata "fora da planta" como parede (sem andar para o void
    // pelo vão da porta da frente antes da vitória disparar).
    if (this.isCellSolid(cx, cz)) return true
    const set = this.grid.get(this.key(cx, cz))
    if (!set) return false
    for (const i of set) {
      const b = this.boxes[i]
      if (!b.enabled) continue
      if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && y > b.min.y && y < b.max.y) return true
    }
    return false
  }

  /** Altura do chão sob os pés (considera caixotes/móveis baixos como plataforma). */
  groundHeight(x, z, feetY, step) {
    this.rebuild()
    const { cx, cz } = this.cellOf(x, z)
    const set = this.grid.get(this.key(cx, cz))
    let best = 0
    if (set) {
      for (const i of set) {
        const b = this.boxes[i]
        if (!b.enabled) continue
        if (x <= b.min.x || x >= b.max.x || z <= b.min.z || z >= b.max.z) continue
        if (b.max.y <= feetY + step + 1e-3 && b.max.y > best) best = b.max.y
      }
    }
    return Math.max(0, best)
  }

  /**
   * Move um cilindro vertical resolvendo penetração eixo a menos-penetração.
   * 3 passes bastam para cantos de corredor estreito.
   * @param {{x:number,z:number}} pos posição dos PÉS
   * @param {{radius:number,height:number,step?:number,feetY?:number}} opts
   * @returns {{x:number,z:number,blocked:boolean}}
   */
  resolveCircle(pos, { radius, height, step = 0.24, feetY = 0 }) {
    this.rebuild()
    let x = pos.x
    let z = pos.z
    let blocked = false
    const s = this.cellSize

    for (let pass = 0; pass < 3; pass += 1) {
      const { cx, cz } = this.cellOf(x, z)
      for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
        for (let gz = cz - 1; gz <= cz + 1; gz += 1) {
          if (this.isCellSolid(gx, gz)) {
            const minX = gx * s
            const maxX = minX + s
            const minZ = gz * s
            const maxZ = minZ + s
            // célula sólida: mesma lógica de AABB abaixo
            const push = pushOut(x, z, radius, { min: { x: minX, z: minZ }, max: { x: maxX, z: maxZ } })
            if (push) {
              x += push.dx
              z += push.dz
              blocked = true
            }
            continue
          }
          const set = this.grid.get(this.key(gx, gz))
          if (!set) continue
          for (const i of set) {
            const b = this.boxes[i]
            if (!b.enabled) continue
            if (b.max.y <= feetY + step) continue // é degrau, não parede
            if (b.min.y >= feetY + height) continue // em cima da cabeça
            const push = pushOut(x, z, radius, { min: { x: b.min.x, z: b.min.z }, max: { x: b.max.x, z: b.max.z } })
            if (push) {
              x += push.dx
              z += push.dz
              blocked = true
            }
          }
        }
      }
    }
    return { x, z, blocked }
  }

  /**
   * Linha de visão por amostragem (barato e suficiente para o cone de IA).
   * @param {{x:number,y:number,z:number}} a
   * @param {{x:number,y:number,z:number}} b
   * @param {{step?:number}} [opts]
   */
  /**
   * @param {{step?:number, stopShort?:number}} [opts]
   *   `stopShort` = metros antes do alvo em que paramos de amostrar. Existe
   *   porque o ALVO costuma ser a própria porta: o painel tem ~13cm e uma
   *   amostra infeliz cai dentro dele e bloqueia a LOS — a porta (e a saída)
   *   ficariam impossíveis de mirar de forma intermitente.
   */
  hasLineOfSight(a, b, { step = 0.32, stopShort = 0 } = {}) {
    this.rebuild()
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const dist = Math.hypot(dx, dy, dz)
    if (dist < 1e-4) return true
    const span = Math.max(0.05, dist - stopShort)
    const samples = Math.max(1, Math.ceil(span / step))
    for (let i = 1; i < samples; i += 1) {
      const t = Math.min((i * step) / dist, span / dist)
      if (this.isBlocked(a.x + dx * t, a.z + dz * t, a.y + dy * t)) return false
    }
    return true
  }

  /** Ponto livre mais próximo de (x,z) — usado para spawn/respawn seguros. */
  nearestFree(x, z, radius = 0.45, searchRadius = 6) {
    const s = this.cellSize
    if (!this.isBlocked(x, z, 1.2)) return { x, z }
    const limit = Math.ceil(searchRadius / s)
    const { cx, cz } = this.cellOf(x, z)
    for (let r = 1; r <= limit; r += 1) {
      for (let ox = -r; ox <= r; ox += 1) {
        for (let oz = -r; oz <= r; oz += 1) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue
          const nx = (cx + ox + 0.5) * s
          const nz = (cz + oz + 0.5) * s
          if (!this.isBlocked(nx, nz, 1.2) && !this.isBlocked(nx + radius, nz, 1.2) && !this.isBlocked(nx, nz + radius, 1.2)) {
            return { x: nx, z: nz }
          }
        }
      }
    }
    return { x, z }
  }
}

/** Empurra um círculo para fora de um AABB 2D no eixo de menor penetração. */
function pushOut(x, z, radius, { min, max }) {
  const overlapX = Math.min(x + radius - min.x, max.x - (x - radius))
  const overlapZ = Math.min(z + radius - min.z, max.z - (z - radius))
  if (overlapX <= 0 || overlapZ <= 0) return null
  if (overlapX < overlapZ) {
    const dir = x < (min.x + max.x) / 2 ? -1 : 1
    return { dx: dir * overlapX, dz: 0 }
  }
  const dir = z < (min.z + max.z) / 2 ? -1 : 1
  return { dx: 0, dz: dir * overlapZ }
}
