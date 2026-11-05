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
import { readFileSync } from 'node:fs'

const { HOUSE, PLAYER, NOISE, GRANNY, DEFAULT_BINDINGS } = await import('../src/core/config.js')
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
    state: { forward: false, back: false, left: false, right: false, crouch: false, ...state },
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

// ─── Parte 2: spawn, controles e movimentação ──────────────────────────────
console.log('parte 2 — spawn/controles/movimento')
const { PlayerController: PC2 } = await import('../src/player/PlayerController.js')
const { Inventory: Inv2 } = await import('../src/player/Inventory.js')
const { PuzzleSystem: Puz2 } = await import('../src/systems/PuzzleSystem.js')
const { EventBus: Bus2 } = await import('../src/core/events.js')

function makePlayer(h, state = {}, { lying = false, at, yaw = -Math.PI / 2 } = {}) {
  const p = new PC2({
    camera: { position: { set() {} }, rotation: { set() {} } },
    world: h.world,
    input: fakeInput(state),
    noise: new NoiseSystem(),
  })
  p.spawn(at ?? h.cellToWorld(10, 6), yaw, { lying })
  return p
}

test('quarto inicial: pequeno, fechado, com o spawn e a chave', () => {
  const h = makeWorld()
  const spawn = h.world.cellOf(h.spawn.player.x, h.spawn.player.z)
  const room = h.roomAt(h.spawn.player.x, h.spawn.player.z)
  assert.equal(room?.id, 'start', `spawn fora do quarto inicial (${room?.id})`)
  // 3x3 células = "quarto pequeno" do doc §1
  const area = (room.x1 - room.x0) * (room.z1 - room.z0)
  assert.ok(area <= 12, `quarto inicial grande demais: ${area} células`)

  // a chave do micro-puzzle mora no próprio quarto
  const keyPoi = h.pois.find((p) => p.item === 'key_room' || p.id === 'poi8')
  assert.ok(keyPoi, 'sem POI da chave do quarto')
  const kc = h.world.cellOf(keyPoi.point.x, keyPoi.point.z)
  assert.equal(h.roomAt(keyPoi.point.x, keyPoi.point.z)?.id, 'start', 'a chave do quarto está fora dele')

  // única saída é a porta trancada em (4,2)
  const door = h.doors.get('door_4_2')
  assert.ok(door, 'sem a porta do quarto inicial (4,2)')
  assert.equal(door.locked, true, 'a porta do quarto deveria nascer trancada')
  assert.equal(door.requires, 'key_room')
  assert.ok(h.world.isBlocked(door.center.x, door.center.z, 1.2), 'vão da porta fechada não bloqueia')
  void spawn
  void kc
})

test('micro-puzzle: sem a chave não abre; com a chave, abre', () => {
  const h = makeWorld()
  const inv = new Inv2({})
  const door = h.doors.get('door_4_2')

  const semChave = door.unlockWith(inv)
  assert.equal(semChave.ok, false)
  assert.equal(semChave.item, 'key_room')
  assert.equal(door.toggle().ok, false, 'porta trancada não deveria abrir')

  // procurar no criado-mudo entrega a chave (mesmo com o sorteio da run rodando)
  const busP = new Bus2()
  const puz = new Puz2({ bus: busP, house: h, inventory: inv, rng: mulberry(5) })
  puz.beginRun({ pois: h.pois, itemCount: 4 })
  const drawer = h.pois.find((p) => p.item === 'key_room' || p.id === 'poi8')
  const found = puz.search(drawer)
  assert.equal(found.found?.item, 'key_room', 'o criado-mudo não entregou a chave')
  inv.add('key_room', 'chave do quarto')

  const comChave = door.unlockWith(inv)
  assert.equal(comChave.ok, true, 'a chave do quarto não abriu a porta')
  assert.equal(door.locked, false)
  assert.equal(door.toggle().ok, true, 'destrancada, a porta deveria abrir')
  assert.equal(h.world.isBlocked(door.center.x, door.center.z, 1.2), false, 'porta aberta ainda bloqueia o vão')
})

test('abertura completa: preso, acha a chave, abre a porta e sai do quarto', () => {
  const h = makeWorld()
  const inv = new Inv2({})
  const puz = new Puz2({ bus: new Bus2(), house: h, inventory: inv, rng: mulberry(7) })
  puz.beginRun({ pois: h.pois, itemCount: 4 })

  const p = makePlayer(h, { forward: true }, { lying: true, at: h.spawn.player, yaw: HOUSE.spawnYaw })
  const step = (seconds) => {
    for (let i = 0; i < Math.round(seconds * 60); i += 1) p.update(1 / 60)
  }

  const roomId = () => h.roomAt(p.position.x, p.position.z)?.id ?? null
  step(4) // acorda (1.5s de fade) e caminha para a porta do quarto
  // Encostou na porta: pode estar no quarto ou no vão (que não pertence a
  // nenhum cômodo), mas NUNCA do outro lado.
  assert.notEqual(roomId(), 'bedroom', 'saiu do quarto com a porta trancada')
  assert.ok(h.world.isBlocked(h.doors.get('door_4_2').center.x, h.doors.get('door_4_2').center.z, 1.2))

  const drawer = h.pois.find((x) => x.item === 'key_room' || x.id === 'poi8')
  assert.equal(puz.search(drawer).found?.item, 'key_room', 'o criado-mudo não tinha a chave')
  inv.add('key_room', 'chave do quarto')

  const door = h.doors.get('door_4_2')
  assert.equal(door.unlockWith(inv).ok, true)
  assert.equal(door.toggle().ok, true)

  step(4) // agora atravessa
  assert.equal(
    roomId(),
    'bedroom',
    `não saiu do quarto: parou em ${p.position.x.toFixed(1)},${p.position.z.toFixed(1)}`,
  )
})

test('doc §3: velocidades 3.0 andando / 1.2 agachado, sem sprint', () => {
  const h = makeWorld()
  const walk = makePlayer(h, { forward: true })
  const start = { x: walk.position.x, z: walk.position.z }
  for (let i = 0; i < 120; i += 1) walk.update(1 / 60) // 2s
  const walkDist = Math.hypot(walk.position.x - start.x, walk.position.z - start.z)
  // 2s a 3 m/s com rampa de aceleração: entre 5.4 e 6.0 m
  assert.ok(walkDist > 5.4 && walkDist < 6.05, `andou ${walkDist.toFixed(2)}m em 2s (esperado ~6m)`)

  const crouch = makePlayer(h, { forward: true, crouch: true })
  const c0 = { x: crouch.position.x, z: crouch.position.z }
  for (let i = 0; i < 120; i += 1) crouch.update(1 / 60)
  const crouchDist = Math.hypot(crouch.position.x - c0.x, crouch.position.z - c0.z)
  assert.ok(crouchDist > 2.0 && crouchDist < 2.5, `agachado andou ${crouchDist.toFixed(2)}m em 2s (esperado ~2.4m)`)
  assert.ok(crouchDist < walkDist * 0.5, 'agachado deveria ser bem mais lento')

  // sem sprint: nem no config, nem no controller
  assert.equal(PLAYER.sprintSpeed, undefined, 'sprintSpeed voltou ao config (doc §2 proíbe)')
  assert.equal(DEFAULT_BINDINGS.sprint, undefined, 'binding de sprint voltou (doc §2 proíbe)')
  assert.equal('sprinting' in walk, false, 'PlayerController ainda tem sprinting')
})

test('doc §3: altura dos olhos 1.7 em pé / 0.9 agachado, lerp de 0.2s', () => {
  const h = makeWorld()
  const p = makePlayer(h, {})
  assert.ok(Math.abs(p.eyeY - PLAYER.eyeHeight) < 1e-6, `olho em pé = ${p.eyeY} (esperado 1.7)`)

  p.input = fakeInput({ crouch: true })
  for (let i = 0; i < 12; i += 1) p.update(1 / 60) // 0.2s
  assert.ok(Math.abs(p.eyeY - PLAYER.crouchEye) < 0.02, `agachou em 0.2s e o olho foi para ${p.eyeY} (esperado ~0.9)`)
  // não pode ser instantâneo: no primeiro frame ainda está longe do alvo
  const p2 = makePlayer(h, { crouch: true })
  p2.update(1 / 60)
  assert.ok(p2.eyeY > PLAYER.crouchEye + 0.1, 'a transição de agachar foi instantânea')
})

test('levantar emite postura válida para o HUD (sem "rising")', () => {
  const h = makeWorld()
  const bus = new Bus2()
  const seen = []
  bus.on('player:stance', ({ stance }) => seen.push(stance))
  const p = new PC2({
    camera: { position: { set() {} }, rotation: { set() {} } },
    world: h.world,
    input: fakeInput({}),
    noise: new NoiseSystem(),
    bus,
  })
  p.spawn(h.spawn.player, 0, { lying: true })
  p.input = fakeInput({ forward: true })
  for (let i = 0; i < 200; i += 1) p.update(1 / 60)
  assert.ok(seen.includes('lying'), 'nunca avisou que estava deitado')
  assert.deepEqual(
    [...new Set(seen)],
    ['lying', 'walk'],
    `posturas inválidas no HUD: ${[...new Set(seen)].join(', ')}`,
  )
})

test('doc §1: acorda deitado e levanta no primeiro input', () => {
  const h = makeWorld()
  const p = makePlayer(h, {}, { lying: true, at: h.spawn.player })
  assert.equal(p.wake.phase, 'lying')
  assert.ok(Math.abs(p.eyeY - PLAYER.lyingEye) < 1e-6, `olho deitado = ${p.eyeY} (esperado 0.3)`)
  assert.equal(p.hasControl, false, 'não deveria ter controle antes do fade')

  // segura o controle por wakeHoldTime mesmo com input
  p.input = fakeInput({ forward: true })
  const held = Math.ceil(PLAYER.wakeHoldTime * 60) - 6
  for (let i = 0; i < held; i += 1) p.update(1 / 60)
  const antes = { x: p.position.x, z: p.position.z }
  assert.equal(p.wake.phase, 'lying', 'levantou antes da hora')
  assert.ok(Math.hypot(p.position.x - antes.x, p.position.z - antes.z) < 1e-6, 'deitado não deveria andar')

  // primeiro input depois do fade dispara a levantada de 0.5s
  for (let i = 0; i < 12; i += 1) p.update(1 / 60)
  assert.equal(p.wake.phase, 'rising', 'não começou a levantar')
  for (let i = 0; i < 35; i += 1) p.update(1 / 60)
  assert.equal(p.wake.phase, 'up', 'não terminou de levantar')
  assert.ok(Math.abs(p.eyeY - PLAYER.eyeHeight) < 1e-6, `em pé o olho deveria ser 1.7, veio ${p.eyeY}`)
  const depois = Math.hypot(p.position.x - antes.x, p.position.z - antes.z)
  assert.ok(depois > 0.5, 'depois de levantar deveria conseguir andar')
})

test('doc §4: tábua barulhenta denuncia o passo', () => {
  const h = makeWorld()
  const board = h.world.boards[0]
  assert.ok(board, 'nenhuma tábua registrada')
  assert.deepEqual(h.world.boardAt(board.cx * 3 + 1.5, board.cz * 3 + 1.5), board)

  const andarNormal = () => {
    const p = makePlayer(h, {})
    const noise = new NoiseSystem()
    p.noise = noise
    p.spawn(h.cellToWorld(board.cx, board.cz), -Math.PI / 2)
    p.input = fakeInput({ forward: true })
    for (let i = 0; i < 90; i += 1) p.update(1 / 60)
    return noise.pending[0]?.loudness ?? 0
  }
  const naTabua = andarNormal()
  assert.ok(naTabua >= PLAYER.noise.board, `passo na tábua saiu ${naTabua} (esperado >= ${PLAYER.noise.board})`)
})

test('doc §5/§6: pitch travado em 85°, interação a 2.5m, FOV 78', async () => {
  const { Engine } = await import('../src/core/Engine.js')
  const graus = (PLAYER.maxPitch * 180) / Math.PI
  assert.ok(graus > 84 && graus <= 85.001, `pitch máximo = ${graus}° (doc pede ~85°)`)
  assert.equal(PLAYER.interactRange, 2.5, 'alcance de interação deveria ser 2.5 (doc §6)')
  // FOV vive no Engine (precisa de WebGL para instanciar): confere na fonte.
  const src = readUtf('../src/core/Engine.js')
  assert.match(src, /PerspectiveCamera\(78,/, 'FOV fora da faixa 75-80 do doc §5')
  void Engine
})

test('mira não é bloqueada pelo próprio alvo (porta/saída)', () => {
  const h = makeWorld()
  const target = h.exits[0].door
  // Em pé a 1.2-2.4m da porta, DENTRO da casa (o vazio depois da varanda é
  // parede por definição): precisa ENXERGAR a porta para poder abri-la.
  for (const back of [1.2, 1.5, 1.8, 2.1, 2.4]) {
    const eye = { x: target.center.x, y: 1.7, z: target.center.z - back }
    const p = { x: target.center.x, y: 1.15, z: target.center.z }
    assert.equal(
      h.world.hasLineOfSight(eye, p, { step: 0.45, stopShort: 0.3 }),
      true,
      `porta da frente invisível a ${back}m — o painel bloqueou a própria mira`,
    )
  }
  // Uma parede de verdade continua bloqueando (não viramos um raio-X).
  const a = h.cellToWorld(10, 6)
  const b = h.cellToWorld(10, 9)
  assert.equal(h.world.hasLineOfSight({ x: a.x, y: 1.6, z: a.z }, { x: b.x, y: 1.6, z: b.z }, { step: 0.45 }), false)
})

test('doc §2: bindings — E ou clique interagem, Tab/Q inventário, G larga, Esc pausa', () => {
  assert.ok(DEFAULT_BINDINGS.interact.includes('KeyE'), 'E não interage')
  assert.ok(DEFAULT_BINDINGS.interact.includes('Mouse0'), 'clique esquerdo não interage (doc §2)')
  assert.deepEqual(DEFAULT_BINDINGS.inventory, ['Tab', 'KeyQ'])
  assert.deepEqual(DEFAULT_BINDINGS.drop, ['KeyG'])
  assert.deepEqual(DEFAULT_BINDINGS.pause, ['Escape'])
  assert.ok(DEFAULT_BINDINGS.crouch.includes('ControlLeft'), 'Ctrl deveria agachar')
  for (const dir of ['forward', 'back', 'left', 'right']) assert.ok(DEFAULT_BINDINGS[dir]?.length, `sem binding de ${dir}`)
})

// ─── player ───────────────────────────────────────────────────────────────
console.log('player')
test('andar gera ruído de passo proporcional à postura', () => {
  const h = makeWorld()
  const yawDownCorridor = -Math.PI / 2 // corredor: +X, sem parede na frente
  // O spawn do jogador agora é o quarto inicial (3x3): pequeno demais para
  // medir passada. Medimos no corredor.
  const lane = h.cellToWorld(10, 6)
  const makePlayer = (noise, state) => {
    const p = new PlayerController({
      camera: { position: { set() {} }, rotation: { set() {} } },
      world: h.world,
      input: fakeInput(state),
      noise,
    })
    p.spawn(lane, yawDownCorridor)
    return p
  }

  const walkNoise = new NoiseSystem()
  const walk = makePlayer(walkNoise, { forward: true })
  const start = { x: lane.x, z: lane.z }
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

// ─── boot ─────────────────────────────────────────────────────────────────
// O sintoma mais ruin de um site estatico e o "loading infinito": o HTML abre,
// o bundle nao roda, e nao ha erro nenhum na tela. Esses testes garantem que o
// vigia inline continua no HTML e que o main.js conversa com ele.
console.log('boot')
const readUtf = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('index.html tem o vigia de boot inline e os nós que ele usa', () => {
  const html = readUtf('../index.html')
  assert.match(html, /id="loading"/, 'sem #loading')
  assert.match(html, /id="loading-label"/, 'sem #loading-label')
  assert.match(html, /window\.__escapeHouse/, 'sem o vigia inline (__escapeHouse)')
  // Captura em fase de captura: erro de recurso (404 do bundle) nao borbulha.
  assert.match(html, /addEventListener\([\s\S]{0,900}?'error'[\s\S]{0,900}?true\s*,/, "vigia precisa escutar 'error' com capture=true")
  const iVigia = html.indexOf('window.__escapeHouse')
  const iModulo = html.indexOf('type="module"')
  assert.ok(iVigia > -1 && iModulo > -1 && iVigia < iModulo, 'o vigia tem que vir antes do <script type="module">')
})

test('[hidden] esconde de verdade e o loading é removido ao terminar', () => {
  const css = readUtf('../src/styles/main.css')
  // .loading é display:grid — sem uma regra de autor, `hidden` não esconde.
  assert.match(css, /\[hidden\][\s\S]{0,80}?display:\s*none\s*!important/, 'CSS sem [hidden]{display:none!important}: node.hidden nao esconde .loading')
  const menus = readUtf('../src/ui/Menus.js')
  const hide = menus.slice(menus.indexOf('hideLoading()'))
  assert.match(hide, /hidden = true/, 'hideLoading nao marca hidden')
  assert.match(hide, /style\.display = 'none'/, 'hideLoading nao força display:none')
  assert.match(hide, /\.remove\(\)/, 'hideLoading nao remove o nó (evita sobrepor o menu)')
})

test('construir o Game não pode estourar fora de promise', () => {
  const js = readUtf('../src/main.js')
  // new Game() cria o WebGLRenderer: se estourar aqui, nao existe .catch() que
  // pegue — o try é a diferença entre tela de erro e loading infinito.
  assert.match(js, /try \{[\s\S]{0,200}?new Game\([\s\S]{0,200}?\} catch \(err\) \{\s*fatal\(err\)/, 'new Game() fora de try/catch')
  // Rede de segurança para o que escapar de qualquer promise.
  assert.match(js, /addEventListener\('unhandledrejection'/, "sem handler de 'unhandledrejection'")
  assert.match(js, /addEventListener\('error'/, "sem handler global de 'error'")
})

test('nada usa `canvas` fora de escopo (o bug do "canvas is not defined")', () => {
  // Em Game.js, `canvas` só existe como parâmetro do construtor. Qualquer uso
  // fora dele vira ReferenceError EM TEMPO DE CONSTRUÇÃO — ou seja, fora de
  // promise, sem cair em catch nenhum. Daí a regra: só `this.canvas`.
  const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const src = semComentarios(readUtf('../src/core/Game.js'))
  const ctor = src.indexOf('constructor(')
  const depoisDoConstrutor = src.slice(src.indexOf('#handlers()', ctor))
  const usoSolto = depoisDoConstrutor.match(/(^|[^.\w'"`])canvas\b/g)
  assert.equal(usoSolto, null, `referência solta a canvas fora do construtor: ${usoSolto}`)
  for (const f of ['../src/core/Game.js', '../src/main.js', '../src/ui/HUD.js', '../src/ui/Menus.js']) {
    const t = semComentarios(readUtf(f))
    assert.ok(!/(^|[^.\w'"`])canvas\.addEventListener/.test(t), `${f} usa canvas.addEventListener sem this.`)
  }
})

test('modo 2D desenha a planta quando não existe WebGL', async () => {
  const { FallbackView } = await import('../src/ui/FallbackView.js')
  const h = makeWorld()
  const view = new FallbackView({ house: h, cell: 10 })
  assert.ok(view.width > 0 && view.height > 0, 'view sem tamanho')

  // contexto 2D falso: registra as operações, sem precisar de DOM/canvas.
  const ops = []
  const rec = (name) => (...args) => ops.push({ name, args })
  const ctx = {
    fillStyle: '', strokeStyle: '',
    fillRect: rec('fillRect'), strokeRect: rec('strokeRect'),
    beginPath: rec('beginPath'), arc: rec('arc'), fill: rec('fill'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), closePath: rec('closePath'),
  }

  const p = h.spawn.player
  view.draw(ctx, {
    player: { x: p.x, z: p.z, yaw: -Math.PI / 2 },
    granny: { x: h.spawn.granny.x, z: h.spawn.granny.z },
    pois: h.pois,
  })

  const retangulos = ops.filter((o) => o.name === 'fillRect')
  assert.ok(retangulos.length > 20, `desenhou só ${retangulos.length} retângulos`)
  // nada pode sair da área do canvas
  for (const r of retangulos) {
    const [x, y, w, hh] = r.args
    assert.ok(x >= -1 && y >= -1 && x + w <= view.width + 1 && y + hh <= view.height + 1, `retângulo fora da área: ${r.args}`)
  }
  // jogador e Granny viram marcações (arco/triângulo)
  assert.ok(ops.some((o) => o.name === 'arc'), 'sem marcador redondo (Granny/POI)')
  assert.ok(ops.some((o) => o.name === 'moveTo'), 'sem marcador do jogador')
  // o jogador tem que aparecer dentro da área
  const px = view.toPixel(p.x, p.z)
  assert.ok(px.x > 0 && px.x < view.width && px.y > 0 && px.y < view.height, 'jogador fora do mapa')
})

test('main.js sinaliza started/booted para o vigia', () => {
  const js = readUtf('../src/main.js')
  assert.match(js, /__escapeHouse\.started = true/, 'main.js nao marca started')
  assert.match(js, /__escapeHouse\.booted = true/, 'main.js nao marca booted')
  // Sem prazo, um boot travado vira loading infinito de novo.
  assert.match(js, /Promise\.race\(\[game\.boot\(\)/, 'boot sem watchdog de timeout')
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
