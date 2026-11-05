import * as THREE from 'three'
import { HOUSE } from '../core/config.js'
import { MAP_ROWS, MAP_WIDTH, POI_SLOTS, PROPS, ROOMS } from './floorplan.js'
import { CollisionWorld } from './CollisionWorld.js'
import { Door } from './Doors.js'
import { POI } from './POI.js'

const SOLID = '#'

/**
 * Constrói a casa a partir do floor plan: geometria (instanciada), colisores,
 * portas, móveis e pontos de interação. Nada de modelo .glb da casa — ver
 * docs/DECISOES.md §"geometria procedural".
 */
export class House {
  /** @param {{ assets?: import('../core/AssetLoader.js').AssetLoader, world?: CollisionWorld }} [opts] */
  constructor({ assets, world } = {}) {
    this.assets = assets ?? null
    this.world = world ?? new CollisionWorld()
    this.group = new THREE.Group()
    this.group.name = 'house'
    this.cells = this.parseCells()
    // A colisão precisa saber onde a planta termina (fora = parede).
    this.world.bounds = { w: this.cells[0].length, h: this.cells.length }
    this.doors = new Map()
    /** @type {POI[]} */
    this.pois = []
    this.exits = []
    this.spawn = { player: { x: 0, z: 0 }, granny: { x: 0, z: 0 } }
    this.rooms = ROOMS
    this.bounds = {
      w: this.cells[0].length * HOUSE.cell,
      h: this.cells.length * HOUSE.cell,
    }
  }

  /** Normaliza as linhas (padding com parede) e devolve grid[char][x]. */
  parseCells() {
    const rows = MAP_ROWS.map((raw) => {
      const padded = raw.length >= MAP_WIDTH ? raw.slice(0, MAP_WIDTH) : raw.padEnd(MAP_WIDTH, SOLID)
      return [...padded]
    })
    // Borda sempre sólida (sem "vazamento" para o void) — EXCETO nas células de
    // porta, que são o próprio vão: 'E' (porta da frente) mora na borda.
    const keep = new Set(['D', 'E'])
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (!keep.has(rows[0][x])) rows[0][x] = SOLID
      if (!keep.has(rows.at(-1)[x])) rows.at(-1)[x] = SOLID
    }
    for (let z = 0; z < rows.length; z += 1) {
      if (!keep.has(rows[z][0])) rows[z][0] = SOLID
      if (!keep.has(rows[z][MAP_WIDTH - 1])) rows[z][MAP_WIDTH - 1] = SOLID
    }
    return rows
  }

  /**
   * O mapa NÃO é centralizado na origem: a célula (0,0) começa em (0,0).
   * Manter as duas grades (visual e de colisão) no mesmo espaço é o que
   * deixa `CollisionWorld.cellOf` compatível com `markSolid(cx,cz)` — e o
   * smoke test pega exatamente esse tipo de desalinhamento.
   */
  cellToWorld(cx, cz) {
    const s = HOUSE.cell
    return { x: (cx + 0.5) * s, z: (cz + 0.5) * s }
  }

  worldToCell(x, z) {
    const s = HOUSE.cell
    return { cx: Math.floor(x / s), cz: Math.floor(z / s) }
  }

  get center() {
    return { x: (MAP_WIDTH * HOUSE.cell) / 2, z: (this.cells.length * HOUSE.cell) / 2 }
  }

  isSolid(cx, cz) {
    const row = this.cells[cz]
    if (!row) return true
    return row[cx] === SOLID
  }

  isWalkable(cx, cz) {
    const row = this.cells[cz]
    if (!row) return false
    const c = row[cx]
    return c !== undefined && c !== SOLID
  }

  /**
   * Ordem importa: portas convertem 'E'/'D' em vão andável ANTES de paredes e
   * do chão (a varanda é alinhada em X com a porta da frente).
   * @returns {THREE.Group}
   */
  build() {
    this.#materials()
    this.#doors()
    this.#floorAndCeiling()
    this.#walls()
    this.#props()
    this.#spawnsAndPois()
    this.#lights()
    return this.group
  }

  #materials() {
    const tex = (id, repeat) => this.assets?.texture?.(id, repeat) ?? null
    this.mat = {
      wall: new THREE.MeshStandardMaterial({ color: 0x8c8266, roughness: 0.94, map: tex('wall', 4) }),
      floor: new THREE.MeshStandardMaterial({ color: 0x6d5334, roughness: 0.9, map: tex('floor', 8) }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x4a4740, roughness: 0.98, map: tex('ceiling', 8) }),
      door: new THREE.MeshStandardMaterial({ color: 0x4c3521, roughness: 0.86, map: tex('door', 1) }),
      prop: new THREE.MeshStandardMaterial({ color: 0x53432c, roughness: 0.9, map: tex('door', 1) }),
      exit: new THREE.MeshStandardMaterial({ color: 0x59351b, roughness: 0.8, map: tex('door', 1) }),
    }
  }

  #floorAndCeiling() {
    const { w, h } = this.bounds
    const c = this.center
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat.floor)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(c.x, 0, c.z)
    floor.receiveShadow = true
    floor.name = 'floor'
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat.ceiling)
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.set(c.x, HOUSE.ceilingHeight, c.z)
    ceiling.name = 'ceiling'
    this.group.add(floor, ceiling)

    // Chão lá fora, visível pela fresta da porta da frente (dá noção de fuga).
    const exitX = this.exits[0]?.world.x ?? c.x
    const porch = new THREE.Mesh(
      new THREE.PlaneGeometry(HOUSE.cell * 3, HOUSE.cell * 2.6),
      new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 1 }),
    )
    porch.rotation.x = -Math.PI / 2
    porch.position.set(exitX, -0.02, h + HOUSE.cell * 1.3)
    porch.name = 'porch'
    this.group.add(porch)
  }

  /**
   * Paredes como InstancedMesh: um BoxGeometry compartilhado, uma instância por
   * face exposta. ~90 painéis viram 1 draw call. Só geramos a face que dá para
   * um celular andável — o interior da parede nunca aparece na tela.
   */
  #walls() {
    const s = HOUSE.cell
    const t = HOUSE.wallThickness
    const h = HOUSE.wallHeight
    const panels = [] // {x,z,rotY}

    for (let cz = 0; cz < this.cells.length; cz += 1) {
      for (let cx = 0; cx < MAP_WIDTH; cx += 1) {
        if (!this.isSolid(cx, cz)) continue
        this.world.markSolid(cx, cz, true)
        const c = this.cellToWorld(cx, cz)
        const add = (dx, dz, rotY) => panels.push({ x: c.x + dx, z: c.z + dz, rotY })
        if (this.isWalkable(cx, cz - 1)) add(0, -s / 2 + t / 2, 0)
        if (this.isWalkable(cx, cz + 1)) add(0, s / 2 - t / 2, 0)
        if (this.isWalkable(cx - 1, cz)) add(-s / 2 + t / 2, 0, Math.PI / 2)
        if (this.isWalkable(cx + 1, cz)) add(s / 2 - t / 2, 0, Math.PI / 2)
      }
    }

    const geo = new THREE.BoxGeometry(s, h, t)
    const mesh = new THREE.InstancedMesh(geo, this.mat.wall, Math.max(1, panels.length))
    mesh.name = 'walls'
    mesh.castShadow = false
    mesh.receiveShadow = true
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const scale = new THREE.Vector3(1, 1, 1)
    panels.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY)
      m.compose(new THREE.Vector3(p.x, h / 2, p.z), q, scale)
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.count = panels.length
    this.group.add(mesh)
    this.wallPanelCount = panels.length
  }

  /** Móveis: caixa de colisão + bloco simples (o .glb definitivo entra na Parte 4). */
  #props() {
    const s = HOUSE.cell
    const byRoom = new Map(ROOMS.map((r) => [r.id, r]))
    for (const prop of PROPS) {
      const room = byRoom.get(prop.room)
      if (!room) continue
      const [cx, cz] = prop.at
      const c = this.cellToWorld(cx, cz)
      const sx = Math.min(prop.size[0], 1.9) * s
      const sz = Math.min(prop.size[1], 1.9) * s
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, prop.height, sz), this.mat.prop)
      mesh.position.set(c.x, prop.height / 2, c.z)
      mesh.receiveShadow = true
      mesh.name = `prop:${prop.label ?? prop.room}`
      this.group.add(mesh)
      this.world.addBox(
        { x: c.x, y: prop.height / 2, z: c.z },
        { x: sx / 2, y: prop.height / 2, z: sz / 2 },
        'prop',
      )
    }
  }

  /** Células 'D' (porta interna) e 'E' (porta da frente / rota de fuga). */
  #doors() {
    for (let cz = 0; cz < this.cells.length; cz += 1) {
      for (let cx = 0; cx < this.cells[cz].length; cx += 1) {
        const ch = this.cells[cz][cx]
        if (ch !== 'D' && ch !== 'E') continue
        const c = this.cellToWorld(cx, cz)
        // Direção da PASSAGEM determina a orientação da folha: a folha é sempre
        // perpendicular ao fluxo (bloqueia o vão), então corredor norte-sul
        // => painel ao longo de X.
        const passageX = this.isWalkable(cx - 1, cz) || this.isWalkable(cx + 1, cz)
        const passageZ = this.isWalkable(cx, cz - 1) || this.isWalkable(cx, cz + 1)
        const spanAxis = passageX && !passageZ ? 'z' : 'x'
        const isExit = ch === 'E'
        // Swing para o lado "fechado"/interior, assim a folha não atravessa a parede.
        const swingSign = spanAxis === 'x' ? (this.isSolid(cx, cz + 1) ? -1 : 1) : this.isSolid(cx + 1, cz) ? -1 : 1
        const door = new Door({
          id: isExit ? 'front' : `door_${cx}_${cz}`,
          center: c,
          spanAxis,
          world: this.world,
          material: isExit ? this.mat.exit : this.mat.door,
          locked: isExit, // a porta da frente só abre com a fuga liberada
          label: isExit ? 'porta da frente' : 'porta',
          swingSign,
        })
        this.doors.set(door.id, door)
        this.group.add(door.object3D)
        // O vão da porta volta a ser célula andável para colisão/LOS.
        this.world.markSolid(cx, cz, false)
        this.cells[cz][cx] = '.'
        if (isExit) this.exits.push({ door, cell: { cx, cz }, world: c })
      }
    }
  }

  #spawnsAndPois() {
    for (let cz = 0; cz < this.cells.length; cz += 1) {
      for (let cx = 0; cx < MAP_WIDTH; cx += 1) {
        const marker = (MAP_ROWS[cz] || '')[cx]
        const spec = POI_SLOTS[marker]
        if (!spec) continue
        const c = this.cellToWorld(cx, cz)
        if (spec.kind === 'spawn') {
          if (spec.who === 'player') this.spawn.player = c
          if (spec.who === 'granny') this.spawn.granny = c
          continue
        }
        // 'E' vira POI no loop de exits logo abaixo — criar aqui duplicaria a porta.
        if (spec.kind === 'exit') continue
        const poi = new POI({
          id: `poi${marker}`,
          kind: spec.kind,
          label: spec.label ?? spec.kind,
          item: spec.item,
          container: spec.container,
          puzzle: spec.puzzle,
          point: new THREE.Vector3(c.x, 1.15, c.z),
          world: this.world,
          assets: this.assets,
          door: this.exits.find((e) => e.cell.cx === cx && e.cell.cz === cz)?.door,
        })
        this.pois.push(poi)
        this.group.add(poi.object3D)
      }
    }
    // A porta da frente também é um POI de saída.
    for (const exit of this.exits) {
      const poi = new POI({
        id: 'poi_exit',
        kind: 'exit',
        label: exit.door.label,
        point: exit.door.focusPoint,
        door: exit.door,
        world: this.world,
        assets: this.assets,
      })
      this.pois.push(poi)
      this.group.add(poi.object3D)
    }
  }

  #lights() {
    this.group.add(new THREE.HemisphereLight(0x2a2f3a, 0x0a0a0c, HOUSE.ambient * 6))

    const lampCells = [
      [4, 2],
      [16, 2],
      [10, 6],
      [4, 9],
      [16, 9],
      [11, 13],
    ]
    this.lamps = []
    for (const [cx, cz] of lampCells) {
      if (!this.isWalkable(cx, cz)) continue
      const c = this.cellToWorld(cx, cz)
      const light = new THREE.PointLight(0xffb066, 6.5, HOUSE.cell * 3.4, 2)
      light.position.set(c.x, HOUSE.wallHeight - 0.35, c.z)
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
      )
      bulb.position.copy(light.position)
      this.group.add(light, bulb)
      this.lamps.push({ light, bulb, base: light.intensity })
    }
  }

  /** Luz do jogador: spotlight fraco, intensidade 0 até alguém acender (L). */
  attachPlayerLight(camera) {
    const spot = new THREE.SpotLight(0xfff0d6, 0, HOUSE.lanternRange, 0.6, 0.45, 1.4)
    spot.position.set(0, 0, 0)
    spot.target.position.set(0, 0, -1)
    camera.add(spot, spot.target)
    this.lantern = spot
    return spot
  }

  setLantern(on) {
    if (!this.lantern) return
    this.lantern.intensity = on ? HOUSE.lanternIntensity : 0
  }

  /** Flicker das lâmpadas: baratinho e é o que vende o clima de casa abandonada. */
  #flicker(t) {
    if (!this.lamps) return
    for (let i = 0; i < this.lamps.length; i += 1) {
      const lamp = this.lamps[i]
      const n = Math.sin(t * (2.1 + i * 0.37)) * 0.5 + Math.sin(t * (7.3 + i * 0.11)) * 0.5
      lamp.light.intensity = lamp.base * (0.86 + 0.14 * n)
    }
  }

  update(dt, elapsed) {
    for (const door of this.doors.values()) door.update(dt)
    this.#flicker(elapsed)
  }

  /** Busca a porta mais próxima de um ponto (usada por ruído/IA). */
  nearestDoor(point, maxDist = 4) {
    let best = null
    let bestD = maxDist
    for (const door of this.doors.values()) {
      const d = Math.hypot(door.center.x - point.x, door.center.z - point.z)
      if (d < bestD) {
        best = door
        bestD = d
      }
    }
    return best
  }

  roomAt(x, z) {
    const { cx, cz } = this.world.cellOf(x, z)
    return ROOMS.find((r) => cx >= r.x0 && cx < r.x1 && cz >= r.z0 && cz < r.z1) ?? null
  }

  describe() {
    return {
      cells: `${MAP_WIDTH}×${this.cells.length}`,
      wallPanels: this.wallPanelCount ?? 0,
      doors: this.doors.size,
      pois: this.pois.length,
      exits: this.exits.length,
    }
  }
}
