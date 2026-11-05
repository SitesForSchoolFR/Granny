/**
 * Grafo de navegação derivado do floor plan: todo célula andável é um nó, com
 * arestas para as 4 vizinhas andáveis. BFS simples — numa casa de ~200 células
 * isso é mais rápido (e muito mais previsível) que A*, e o resultado é o
 * caminho "de corredor" que a gente quer: a Granny anda por dentro dos cômodos,
 * não corta parede na diagonal.
 *
 * Recalcula só quando algo muda a passagem (porta fechando no caminho) — `dirty`.
 */
export class NavGrid {
  /** @param {import('../world/House.js').House} house */
  constructor(house) {
    this.house = house
    this.cell = 1
    /** @type {Map<string, string[]>} */
    this.adj = new Map()
    this.nodes = []
    this.build()
  }

  key(cx, cz) {
    return `${cx},${cz}`
  }

  build() {
    this.adj.clear()
    this.nodes = []
    const rows = this.house.cells
    for (let cz = 0; cz < rows.length; cz += 1) {
      for (let cx = 0; cx < rows[cz].length; cx += 1) {
        if (!this.house.isWalkable(cx, cz)) continue
        const k = this.key(cx, cz)
        this.nodes.push({ k, cx, cz, world: this.house.cellToWorld(cx, cz) })
        const list = []
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          if (this.house.isWalkable(cx + dx, cz + dz)) list.push(this.key(cx + dx, cz + dz))
        }
        this.adj.set(k, list)
      }
    }
    this.byId = new Map(this.nodes.map((n) => [n.k, n]))
  }

  nearestNode(x, z) {
    let best = null
    let bestD = Infinity
    for (const n of this.nodes) {
      const d = (n.world.x - x) ** 2 + (n.world.z - z) ** 2
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    return best
  }

  /** @returns {Array<{world:{x:number,z:number}}>|null} caminho do início (exclusivo) ao fim */
  path(from, to) {
    const start = this.nearestNode(from.x, from.z)
    const goal = this.nearestNode(to.x, to.z)
    if (!start || !goal) return null
    if (start === goal) return [goal]
    /** @type {Map<string,string|null>} */
    const prev = new Map([[start.k, null]])
    const queue = [start.k]
    let head = 0
    while (head < queue.length) {
      const k = queue[head++]
      if (k === goal.k) return this.#reconstruct(prev, k)
      for (const next of this.adj.get(k) ?? []) {
        if (prev.has(next)) continue
        prev.set(next, k)
        queue.push(next)
      }
    }
    return null
  }

  #reconstruct(prev, endKey) {
    const out = []
    let k = endKey
    while (k) {
      out.push(this.byId.get(k))
      k = prev.get(k) ?? null
    }
    return out.reverse()
  }

  /** Caminho mais curto em metros, ou Infinity se desconectado (usado em testes). */
  distance(from, to) {
    const path = this.path(from, to)
    if (!path) return Infinity
    let d = 0
    for (let i = 1; i < path.length; i += 1) {
      d += Math.hypot(path[i].world.x - path[i - 1].world.x, path[i].world.z - path[i - 1].world.z)
    }
    return d
  }
}
