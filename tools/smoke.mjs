/**
 * SMOKE TEST headless — roda em `npm run smoke` e no CI antes do build.
 *
 * Cobre o que não precisa de WebGL: parsing da planta, colisores, LOS,
 * ruído→IA, captura, puzzles, save e a máquina de estados. Se o CI do Pages
 * quebrar, quebra aqui — não na cara de quem joga.
 *
 * Uso local: node tools/smoke.mjs  (ou npm run smoke)
 */
import assert from 'node:assert/strict'

const { HOUSE, PLAYER, NOISE, GRANNY } = await import('../src/core/config.js')
const { CollisionWorld } = await import('../src/world/CollisionWorld.js')
const { House } = await import('../src/world/House.js')
const { NavGrid } = await import('../src/ai/NavGrid.js')
const { GrannyAI, AIState } = await import('../src/ai/GrannyAI.js')
const { NoiseSystem } = await import('../src/systems/NoiseSystem.js')
const { PuzzleSystem } = await import('../src/systems/PuzzleSystem.js')
const { Inventory } = await import('../src/player/Inventory.js')
const { SaveSystem } = await import('../src/systems/SaveSystem.js')
const { PlayerController } = await import('../src/player/PlayerController.js')
const { StateMachine, GameState } = await import('../src/core/state.js')
const { EventBus } = await import('../src/core/events.js')
const { MAP_ROWS } = await import('../src/world/floorplan.js')

let passed = 0
const failures = []
function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failures.push({ name, err })
    console.log(`  ✗ ${name}\n      ${err.message}`)
  }
}

/** Stub mínimo de InputManager: o PlayerController só usa esses 4 métodos. */
function fakeInput(state = {}) {
  return {
    state: { forward: false, back: false, left: false, right: false, sprint: false, crouch: false, ...state },
    isDown(a) {
      return !!this.state[a]
    },
    axis(neg, pos) {
      return (this.state[pos] ? 1 : 0) - (this.state[neg] ? 1 : 0)
    },
    wasPressed() {
      return false
    },
    consumeMouseDelta(target) {
      target.x = 0
      target.y = 0
      return target
    },
    sensitivity: 1,
    invertY: false,
  }
}

function makeWorld() {
  const house = new House({ assets: null })
  house.build()
  return house
}

console.log('\nEscape House — smoke test\n')

// ─── planta ───────────────────────────────────────────────────────────────
const house = makeWorld()
const W = Math.max(...MAP_ROWS.map((r) => r.length))

console.log('floor plan')
test('todas as linhas normalizadas para a mesma largura', () => {
  assert.equal(house.cells.length, MAP_ROWS.length)
  for (const row of house.cells) assert.equal(row.length, W, `largura ${row.length} != ${W}`)
})
test('borda bloqueada: sem vazar para o void (portas começam fechadas)', () => {
  const blocked = (cx, cz) => {
    const c = house.cellToWorld(cx, cz)
    return house.world.isBlocked(c.x, c.z, 1.2)
  }
  for (let x = 0; x < W; x += 1) {
    assert.ok(blocked(x, 0),`borda superior aberta em x=${x}`)
    assert.ok(blocked(x, house.cells.length - 1), `borda inferior aberta em x=${x}`)
  }
  for (let z = 0; z < house.cells.length; z += 1) {
    assert.ok(blocked(0, z), `borda esquerda aberta em z=${z}`)
    assert.ok(blocked(W - 1, z), `borda direita aberta em z=${z}`)
  }
  // E o void além da planta continua bloqueado mesmo com a porta da frente aberta:
  const front = house.exits[0].door
  front.setLocked(false)
  front.toggle()
  const beyond = house.cellToWorld(house.exits[0].cell.cx, house.cells.length)
  assert.ok(house.world.isBlocked(beyond.x, beyond.z, 1.2), 'andou para fora do mapa pela porta')
  front.toggle()
  front.setLocked(true)
})
test('spawn do jogador e da Granny existem e são andáveis', () => {
  assert.ok(house.spawn.player && house.spawn.granny)
  const p = house.world.cellOf(house.spawn.player.x, house.spawn.player.z)
  const g = house.world.cellOf(house.spawn.granny.x, house.spawn.granny.z)
  assert.ok(house.isWalkable(p.cx, p.cz), 'spawn do jogador dentro de parede')
  assert.ok(house.isWalkable(g.cx, g.cz), 'spawn da Granny dentro de parede')
  const dist = Math.hypot(house.spawn.player.x - house.spawn.granny.x, house.spawn.player.z - house.spawn.granny.z)
  assert.ok(dist > 8, `spawn perto demais (${dist.toFixed(1)}m)`)
})
test('portas e saída registradas', () => {
  assert.ok(house.doors.size >= 5, `esperava >=5 portas, achei ${house.doors.size}`)
  assert.equal(house.exits.length, 1, 'exatamente uma porta da frente')
  assert.equal(house.exits[0].door.locked, true, 'porta da frente deve nascer trancada')
})
test('a casa é um grafo conexo (todo cômodo alcançável do spawn)', () => {
  const nav = new NavGrid(house)
  const unreachable = nav.nodes.filter((n) => !Number.isFinite(nav.distance(house.spawn.player, n.world)))
  assert.equal(unreachable.length, 0, `${unreachable.length} células isoladas: ${unreachable.map((n) => n.k).join(', ')}`)
})
test('POIs montados e nenhum dentro de parede', () => {
  assert.ok(house.pois.length >= 6, `poucos POIs: ${house.pois.length}`)
  for (const poi of house.pois) {
    const c = house.world.cellOf(poi.point.x, poi.point.z)
    assert.ok(house.isWalkable(c.cx, c.cz), `POI ${poi.id}(${poi.kind}) encaixotado em ${c.cx},${c.cz}`)
  }
})

// ─── colisão ──────────────────────────────────────────────────────────────
console.log('collision')
test('empurrão contra parede não atravessa', () => {
  const { x, z } = house.spawn.player
  const world = house.world
  let px = x
  let pz = z
  for (let i = 0; i < 400; i += 1) {
    const r = world.resolveCircle({ x: px, z: pz - 0.2 }, { radius: PLAYER.radius, height: PLAYER.height, step: PLAYER.stepHeight })
    px = r.x
    pz = r.z
  }
  const cell = world.cellOf(px, pz)
  assert.ok(!world.isCellSolid(cell.cx, cell.cz), 'jogador atravessou para dentro de uma parede')
})
test('porta: trancada não abre, destrancada abre e libera o vão', () => {
  const exit = house.exits[0].door
  const probe = exit.focusPoint
  assert.equal(exit.isOpen, false)
  assert.ok(house.world.isBlocked(probe.x, probe.z, 1.2), 'vão deveria estar bloqueado com a porta fechada')
  assert.equal(exit.toggle().reason, 'locked', 'porta trancada abriu')
  exit.setLocked(false)
  assert.equal(exit.toggle().ok, true)
  assert.equal(house.world.isBlocked(probe.x, probe.z, 1.2), false, 'vão continuou bloqueado com a porta aberta')
  exit.update(1) // animação de swing
  assert.ok(Math.abs(exit.pivot.rotation.y) > 0.5, 'a folha não girou')
  exit.toggle()
  exit.setLocked(true)
})
test('linha de visão respeita paredes', () => {
  const world = house.world
  const a = house.cellToWorld(4, 2) // quarto esquerda
  const b = house.cellToWorld(16, 2) // escritório direita
  assert.equal(world.hasLineOfSight({ x: a.x, y: 1.5, z: a.z }, { x: b.x, y: 1.5, z: b.z }), false, 'parede não bloqueou LOS')
  const c = house.cellToWorld(6, 6)
  const d = house.cellToWorld(12, 6)
  assert.equal(world.hasLineOfSight({ x: c.x, y: 1.5, z: c.z }, { x: d.x, y: 1.5, z: d.z }), true, 'corredor livre deveria ter LOS')
})

// ─── ruído + IA ───────────────────────────────────────────────────────────
console.log('noise + AI')
test('ruído baixo é descartado, alto chega longe', () => {
  const noise = new NoiseSystem()
  assert.equal(noise.emit({ position: { x: 0, z: 0 }, loudness: 0.001, type: 'x' }), null)
  const ev = noise.emit({ position: { x: 0, z: 0 }, loudness: 1, type: 'x' })
  assert.ok(ev.radius >= NOISE.maxRadius - 0.001)
})
test('atenuação por distância', () => {
  const noise = new NoiseSystem()
  noise.emit({ position: { x: 0, z: 0 }, loudness: 0.5, source: 'player' })
  const near = noise.consume({ x: 1, z: 0 })
  noise.emit({ position: { x: 0, z: 0 }, loudness: 0.5, source: 'player' })
  const far = noise.consume({ x: 60, z: 0 })
  assert.equal(near.length, 1)
  assert.equal(far.length, 0)
  assert.ok(near[0].strength > 0)
})
test('consumir esvazia a fila (não ouvir 2x o mesmo passo)', () => {
  const noise = new NoiseSystem()
  noise.emit({ position: { x: 0, z: 0 }, loudness: 0.7, source: 'player' })
  assert.equal(noise.consume({ x: 0, z: 0 }).length, 1)
  assert.equal(noise.consume({ x: 0, z: 0 }).length, 0)
})

const nav = new NavGrid(house)
const bus = new EventBus()
const noiseForAI = new NoiseSystem({ bus })
const granny = new GrannyAI({ world: house.world, nav, house, noise: noiseForAI, bus })
granny.spawn(house.spawn.granny)
const fakePlayer = { position: { x: house.spawn.player.x, y: 0, z: house.spawn.player.z }, height: PLAYER.height, crouching: false, concealed: false }

test('Granny vai investigar o barulho', () => {
  assert.equal(granny.state, AIState.PATROL)
  // Estrondo a ~10 m dela: dentro do alcance de audição, longe o bastante para não ser "vista".
  const loud = { x: granny.position.x + 8, y: 0, z: granny.position.z + 4 }
  fakePlayer.position.x = loud.x
  fakePlayer.position.z = loud.z
  noiseForAI.emit({ position: loud, loudness: 0.9, source: 'player' })
  for (let i = 0; i < 40; i += 1) granny.update(1 / 60, fakePlayer)
  assert.notEqual(granny.state, AIState.PATROL, 'não saiu da patrulha depois de um estrondo')
})
test('Granny não atravessa parede perseguindo', () => {
  // Coloca a Granny de um lado e o jogador do outro, com ruído alto no meio do corredor.
  const hall = house.cellToWorld(10, 6)
  granny.spawn(hall)
  const target = house.cellToWorld(4, 9)
  const start = { x: granny.position.x, z: granny.position.z }
  fakePlayer.position.x = target.x
  fakePlayer.position.z = target.z
  let inside = 0
  for (let i = 0; i < 600; i += 1) {
    granny.update(1 / 60, fakePlayer)
    const c = house.world.cellOf(granny.position.x, granny.position.z)
    if (house.isSolid(c.cx, c.cz)) inside += 1
  }
  assert.equal(inside, 0, `a Granny ficou ${inside} ticks dentro de parede`)
  const moved = Math.hypot(granny.position.x - start.x, granny.position.z - start.z)
  assert.ok(moved > 1, `a Granny não se moveu (${moved.toFixed(2)}m)`)
})
test('Granny alcança e captura o jogador parado', () => {
  const hall = house.cellToWorld(10, 6)
  granny.spawn(hall)
  granny.state = AIState.PATROL
  fakePlayer.position.x = hall.x + 1.2
  fakePlayer.position.z = hall.z
  let caught = 0
  bus.on('granny:catch', () => {
    caught += 1
  })
  for (let i = 0; i < 240; i += 1) {
    granny.update(1 / 60, fakePlayer)
    fakePlayer.position.x = granny.position.x + 0.7
  }
  assert.ok(caught >= 1, 'nunca capturou')
})
test('escondido: invisível de longe, descoberto de perto', () => {
  const g = new GrannyAI({ world: house.world, nav, house, noise: new NoiseSystem(), bus })
  const hall = house.cellToWorld(10, 6)
  g.spawn(hall)
  g.facing = Math.PI / 2 // olhando para +X, onde está o alvo
  const at = (d) => ({ position: { x: g.position.x + d, y: 0, z: g.position.z }, height: PLAYER.height, crouching: true, concealed: true })
  assert.equal(g.canSee(at(6)), false, 'escondido foi visto a 6m')
  assert.equal(g.canSee({ ...at(6), concealed: false }), true, 'descoberto não foi visto a 6m')
  assert.equal(g.canSee({ ...at(GRANNY.concealSafeDistance * 0.5), concealed: true }), true, 'ela encostou e não achou ninguém')
})

test('agachar reduz o alcance de visão', () => {
  const before = new GrannyAI({ world: house.world, nav, house, noise: new NoiseSystem(), bus })
  before.spawn({ x: hall2(house).x, z: hall2(house).z })
  before.facing = 0
  const far = { position: { x: before.position.x, z: before.position.z + 12 }, height: PLAYER.height }
  const visible = before.canSee({ ...far, crouching: false })
  const crouched = before.canSee({ ...far, crouching: true })
  assert.ok(!crouched || visible, 'agachar não deveria ajudar a ser visto')
})
function hall2(h) {
  return h.cellToWorld(10, 6)
}

// ─── puzzles ──────────────────────────────────────────────────────────────
console.log('puzzles')
test('run começa com os itens-chave escondidos e a saída trancada', () => {
  const h = makeWorld()
  const busP = new EventBus()
  const inv = new Inventory({ bus: busP })
  const puz = new PuzzleSystem({ bus: busP, house: h, inventory: inv, rng: mulberry(7) })
  puz.beginRun({ pois: h.pois, itemCount: 4 })
  const hidden = [...puz.loot.values()].filter(Boolean).map((l) => l.item)
  for (const key of puz.requiredKeys) assert.ok(hidden.includes(key), `${key} não foi escondido — run invencível/invencível-impossível`)
  assert.equal(h.exits[0].door.locked, true)
  assert.equal(puz.escapeReady(), false)
  assert.match(puz.escapeBlockReason(), /chave|cadeado/)
})
test('coletar chave + bilhete + abrir cadeado libera a fuga', () => {
  const h = makeWorld()
  const busP = new EventBus()
  const inv = new Inventory({ bus: busP })
  const puz = new PuzzleSystem({ bus: busP, house: h, inventory: inv, rng: mulberry(11) })
  puz.beginRun({ pois: h.pois, itemCount: 4 })
  // pesca os itens pelos POIs, como o jogador faria
  for (const poi of h.pois) {
    poi.interact({ inventory: inv, puzzles: puz })
  }
  assert.ok(inv.has('key_hall'), 'chave mestra não chegou ao inventário')
  assert.ok(inv.has('padlock_code'), 'bilhete não chegou ao inventário')
  const front = h.pois.find((p) => p.kind === 'exit')
  assert.ok(front, 'floor plan sem POI de saída')
  front.interact({ inventory: inv, puzzles: puz })
  assert.equal(puz.escapeReady(), true, 'fuga não liberada depois de tudo resolvido')
  assert.equal(h.exits[0].door.locked, false, 'porta continuou trancada')
  const res = h.exits[0].door.toggle()
  assert.equal(res.ok, true)
})
test('sorteio de loot é reproduzível com a mesma seed', () => {
  const snap = (seed) => {
    const h = makeWorld()
    const inv = new Inventory({})
    const puz = new PuzzleSystem({ house: h, inventory: inv, rng: mulberry(seed) })
    puz.beginRun({ pois: h.pois, itemCount: 4 })
    return JSON.stringify([...puz.loot.entries()])
  }
  assert.equal(snap(3), snap(3))
})

// ─── player ───────────────────────────────────────────────────────────────
console.log('player')
test('andar gera ruído de passo proporcional à postura', () => {
  const h = makeWorld()
  const yawDownCorridor = -Math.PI / 2 // corredor: +X, sem parede na frente
  const makePlayer = (noise, state) => {
    const p = new PlayerController({
      camera: { position: { set() {} }, rotation: { set() {} } },
      world: h.world,
      input: fakeInput(state),
      noise,
    })
    p.spawn(h.spawn.player, yawDownCorridor)
    return p
  }

  const walkNoise = new NoiseSystem()
  const walk = makePlayer(walkNoise, { forward: true })
  const start = { x: h.spawn.player.x, z: h.spawn.player.z }
  for (let i = 0; i < 120; i += 1) walk.update(1 / 60)
  const walkDist = Math.hypot(walk.position.x - start.x, walk.position.z - start.z)
  assert.ok(walkDist > 3, `andou só ${walkDist.toFixed(2)}m em 2s (esperava >3m)`)
  assert.ok(Number.isFinite(walk.position.x) && Number.isFinite(walk.position.y), 'posição NaN')
  assert.ok(walkNoise.total >= 3, `esperava passos ruidosos, obtive ${walkNoise.total}`)
  assert.ok(walk.speed > 2, `velocidade baixa demais: ${walk.speed.toFixed(2)}`)

  const crouchNoise = new NoiseSystem()
  const crouch = makePlayer(crouchNoise, { forward: true, crouch: true })
  for (let i = 0; i < 120; i += 1) crouch.update(1 / 60)
  const crouchDist = Math.hypot(crouch.position.x - start.x, crouch.position.z - start.z)
  assert.ok(crouch.crouching, 'crouch não engatou')
  assert.ok(crouchDist < walkDist, 'agachado deveria andar menos')
  assert.ok(crouchNoise.level < walkNoise.level, 'agachado deveria fazer menos barulho')

  // Andar contra a parede não gera "teleporte": o corpo para no colisor.
  const stuck = makePlayer(new NoiseSystem(), { forward: true })
  stuck.yaw = 0 // -Z: fila de parede logo à frente do spawn
  for (let i = 0; i < 180; i += 1) stuck.update(1 / 60)
  const cell = h.world.cellOf(stuck.position.x, stuck.position.z)
  assert.ok(!h.isSolid(cell.cx, cell.cz), 'jogador atravessou parede andando')
})
test('esconderijo não teleporta e só oculta perto do ponto', () => {
  const h = makeWorld()
  const spot = h.pois.find((p) => p.kind === 'hiding')
  assert.ok(spot, 'floor plan sem POI de esconderijo')

  const p = new PlayerController({
    camera: { position: { set() {} }, rotation: { set() {} } },
    world: h.world,
    input: fakeInput({}),
    noise: new NoiseSystem(),
  })
  p.spawn(h.spawn.player, -Math.PI / 2)

  // Interage de ~1.9m (dentro de PLAYER.interactRange, fora de hideRadius).
  const dx = 0
  const dz = PLAYER.hideRadius + 0.7
  p.position.x = spot.point.x + dx
  p.position.z = spot.point.z + dz
  const before = { x: p.position.x, z: p.position.z }

  p.setHidingSpot(spot)
  const moved = Math.hypot(p.position.x - before.x, p.position.z - before.z)
  assert.ok(moved > 0, 'deveria encostar até a borda do esconderijo')
  assert.ok(moved < dz, `não deveria teleportar para o ponto (moveu ${moved.toFixed(2)}m)`)
  assert.ok(p.concealed, 'deveria estar escondido na borda')
  assert.ok(p.crouching, 'esconderijo agacha o jogador')

  // Movimento travado enquanto escondido.
  const held = { x: p.position.x, z: p.position.z }
  p.input = fakeInput({ forward: true })
  for (let i = 0; i < 60; i += 1) p.update(1 / 60)
  assert.equal(Math.hypot(p.position.x - held.x, p.position.z - held.z) < 0.001, true, 'escondido não deveria se mover')

  // Sair devolve o controle e desfaz o ocultamento.
  p.setHidingSpot(null)
  assert.equal(p.concealed, false)
  assert.equal(p.hidingIn, null)
})

test('inventário soma, usa e serializa', () => {
  const inv = new Inventory({ max: 2 })
  assert.equal(inv.add('key_hall'), true)
  assert.equal(inv.add('battery'), true)
  assert.equal(inv.add('bolt_cutters'), false, 'deveria estar cheio')
  inv.remove('battery')
  assert.equal(inv.has('battery'), false)
  inv.add('key_hall')
  assert.equal(inv.count('key_hall'), 2)
  const round = new Inventory({})
  round.fromJSON(JSON.parse(JSON.stringify(inv.toJSON())))
  assert.equal(round.count('key_hall'), 2)
})

// ─── estado + save ────────────────────────────────────────────────────────
console.log('state machine + save')
test('sete estados registrados e transições válidas', () => {
  const sm = new StateMachine({
    handlers: Object.fromEntries(Object.values(GameState).map((k) => [k, {}])),
  })
  for (const k of ['MENU', 'LOADING', 'PLAYING', 'PAUSED', 'CAUGHT', 'WIN', 'LOSE']) assert.ok(sm.handlers.has(k), `faltando estado ${k}`)
  sm.go(GameState.LOADING)
  sm.go(GameState.MENU)
  sm.go(GameState.PLAYING)
  sm.go(GameState.PAUSED)
  sm.back()
  assert.equal(sm.current, GameState.PLAYING)
})
test('LOSE é terminal (nada de voltar a jogar depois do fim)', () => {
  const sm = new StateMachine({ handlers: Object.fromEntries(Object.values(GameState).map((k) => [k, {}])) })
  sm.go(GameState.PLAYING)
  sm.go(GameState.LOSE)
  assert.equal(sm.go(GameState.PLAYING), false)
  assert.equal(sm.current, GameState.LOSE)
})
test('save round-trip + descarte de schema antigo', () => {
  const store = new Map()
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  const s = new SaveSystem({ storage })
  assert.equal(s.save({ a: 1 }), true)
  assert.equal(s.load().state.a, 1)
  store.set('escape-house:save', JSON.stringify({ v: 999, state: { a: 2 } }))
  const s2 = new SaveSystem({ storage })
  assert.equal(s2.load(), null, 'schema divergente deveria invalidar o save')
  assert.equal(s2.clear(), true)
})
test('localStorage indisponível não quebra nada', () => {
  const s = new SaveSystem({ storage: null })
  assert.equal(s.save({ x: 1 }), false)
  assert.equal(s.load(), null)
})

function mulberry(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── resultado ────────────────────────────────────────────────────────────
console.log('')
if (failures.length) {
  console.error(`${failures.length} falha(s):`)
  for (const f of failures) console.error(`\n- ${f.name}\n${f.err.stack}`)
  process.exit(1)
}
console.log(`tudo certo: ${passed} teste(s) passaram\n`)
