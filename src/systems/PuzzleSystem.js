import { Ev } from '../core/events.js'
import { ITEMS, LOOT_POOL, itemLabel } from './items.js'

/**
 * Regras de puzzle/escapatória. A Parte 4 aprofunda (enigma de código, cofre,
 * rota do porão); aqui fica o esqueleto que a casa atual já satisfaz:
 *
 *   escapar = ter a CHAVE MESTRA  +  resolver o CADEADO (precisa do BILHETE)
 *
 * O sistema decide ONDE os itens estão (sorteio por run), o que cada
 * container contém, e se a fuga está liberada. O POI só pergunta.
 */
export class PuzzleSystem {
  /** @param {{bus?: object, house?: object, inventory?: object, rng?: ()=>number}} opts */
  constructor({ bus, house, inventory, rng = Math.random } = {}) {
    this.bus = bus ?? null
    this.house = house ?? null
    this.inventory = inventory ?? null
    this.rng = rng
    /** @type {Map<string, {item:string,label:string}|null>} poiId -> loot */
    this.loot = new Map()
    this.pois = []
    this.solved = new Set()
    this.requiredKeys = ['key_hall', 'padlock_code']
    this.needleFound = 0
    this.searchedCount = 0
    this.exit = null
  }

  /**
   * Prepara uma run. Chamar depois do House.build() e antes do PLAYING.
   * @param {{pois?: object[], itemCount?: number, exitLocked?: boolean}} [opts]
   */
  beginRun({ pois, itemCount = 4, exitLocked = true } = {}) {
    this.pois = pois ?? this.house?.pois ?? []
    this.loot.clear()
    this.solved.clear()
    this.searchedCount = 0
    this.needleFound = 0

    const slots = this.pois.filter((p) => p.kind === 'container' || p.kind === 'item')
    // Embaralha os slots e garante que os itens-chave tenham domicílio.
    const shuffled = [...slots].sort(() => this.rng() - 0.5)
    const keySlots = shuffled.slice(0, Math.max(this.requiredKeys.length, Math.min(itemCount, shuffled.length)))
    this.requiredKeys.forEach((id, i) => {
      const slot = keySlots[i]
      if (slot) this.loot.set(slot.id, { item: id, label: itemLabel(id) })
    })
    // Enfeites: itens não obrigatórios, para a recompensa de explorar existir.
    const extras = LOOT_POOL.filter((id) => !this.requiredKeys.includes(id))
    for (let i = this.requiredKeys.length; i < keySlots.length; i += 1) {
      const slot = keySlots[i]
      if (!slot) continue
      const id = extras[(i - this.requiredKeys.length) % Math.max(1, extras.length)]
      if (id) this.loot.set(slot.id, { item: id, label: itemLabel(id) })
    }
    // Item solto não tem "procurar": o POI entrega o que foi plantado nele.
    for (const slot of slots) {
      if (slot.kind !== 'item') continue
      const planted = this.loot.get(slot.id)
      if (planted) {
        slot.item = planted.item
        slot.label = planted.label
      }
    }

    this.exit = this.house?.exits?.[0] ?? null
    if (this.exit?.door) this.exit.door.setLocked(exitLocked)
    this.bus?.emit(Ev.PUZZLE_PROGRESS, this.progress())
  }

  /** O POI pergunta: "tem algo dentro de mim?". */
  search(poi) {
    this.searchedCount += 1
    const found = this.loot.get(poi.id) ?? null
    if (found) {
      this.loot.set(poi.id, null)
      if (this.requiredKeys.includes(found.item)) this.needleFound += 1
    }
    return { found }
  }

  /** Pegar item solto no chão — só confirma o que já estava planejado. */
  notifyPickup(item, poiId) {
    if (item && this.requiredKeys.includes(item)) this.needleFound += 1
    this.loot.set(poiId, null)
    this.bus?.emit(Ev.PUZZLE_PROGRESS, this.progress())
  }

  /**
   * "Abrir" um puzzle. Na Parte 5 isto vira a UI de teclado numérico; por ora,
   * ter o bilhete no inventário resolve o cadeado (leitura de item = input).
   * @returns {boolean} true se resolveu
   */
  open(poi) {
    if (poi.puzzle === 'padlock' || poi.kind === 'exit') {
      if (this.hasCode()) return this.solve('padlock')
      this.bus?.emit('ui:toast', { text: 'preciso do código (bilhete)', kind: 'warn' })
      return false
    }
    this.bus?.emit('ui:toast', { text: `${poi.label}: quebra-cabeça na Parte 4`, kind: 'info' })
    return false
  }

  /**
   * Última porta. Exige a CHAVE MESTRA (abre a fechadura) e o BILHETE
   * (resolve o cadeado). Retorna o motivo da recusa para o HUD não precisar
   * conhecer regra nenhuma.
   * @param {object} poi POI do tipo 'exit'
   */
  attemptEscape(poi) {
    if (!this.hasKey()) return { ok: false, reason: 'trancada — falta a chave mestra', noise: 0.25 }
    if (this.exit?.door?.locked && !this.hasCode()) {
      return { ok: false, reason: 'o cadeado exige o código do bilhete', noise: 0.3 }
    }
    this.solve('padlock')
    if (poi?.door) {
      poi.door.setLocked(false)
      if (!poi.door.isOpen) poi.door.toggle()
    }
    return { ok: true }
  }

  hasCode() {
    return !!this.inventory?.has?.('padlock_code')
  }

  hasKey() {
    return !!this.inventory?.has?.('key_hall')
  }

  solve(id) {
    if (this.solved.has(id)) return true
    this.solved.add(id)
    if (id === 'padlock' && this.exit?.door) this.exit.door.setLocked(false)
    this.bus?.emit(Ev.PUZZLE_SOLVED, { id })
    this.bus?.emit(Ev.PUZZLE_PROGRESS, this.progress())
    if (this.escapeReady()) this.bus?.emit(Ev.ESCAPE_READY, {})
    return true
  }

  escapeReady() {
    return this.hasKey() && (this.solved.has('padlock') || !this.exit?.door?.locked)
  }

  /** Texto do bloqueio, mostrado quando o jogador tenta a porta à toa. */
  escapeBlockReason() {
    if (!this.hasKey()) return 'trancada — falta a chave mestra'
    if (this.exit?.door?.locked) return 'o cadeado ainda está no lugar'
    return 'trancada'
  }

  progress() {
    const total = this.requiredKeys.length + 1 // +1 = cadeado
    const done = this.needleFound + this.solved.size
    return {
      done,
      total,
      ratio: Math.min(1, done / Math.max(1, total)),
      objectives: [
        { id: 'key_hall', label: 'achar a chave mestra', ok: this.hasKey() },
        { id: 'padlock_code', label: 'achar o bilhete com o código', ok: this.hasCode() },
        { id: 'padlock', label: 'abrir o cadeado da porta da frente', ok: this.solved.has('padlock') },
      ],
      items: Object.keys(ITEMS).length,
      searched: this.searchedCount,
    }
  }
}
