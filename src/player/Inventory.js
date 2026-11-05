/**
 * Inventário do jogador — lista ordenada, com limite e "usar".
 * Itens são ids de `src/systems/items.js` (Parte 4 define o catálogo completo);
 * aqui só existe o contêiner + eventos para o HUD.
 */
export class Inventory {
  /** @param {{max?: number, bus?: object}} [opts] */
  constructor({ max = 8, bus } = {}) {
    this.max = max
    this.bus = bus ?? null
    /** @type {Array<{id:string,label:string,qty:number}>} */
    this.slots = []
  }

  /** @returns {boolean} false se cheio */
  add(id, label = id, qty = 1) {
    if (!id) return false
    const existing = this.slots.find((s) => s.id === id)
    if (existing) {
      existing.qty += qty
      this.#emit('add')
      return true
    }
    if (this.slots.length >= this.max) {
      this.bus?.emit('ui:toast', { text: 'inventário cheio', kind: 'warn' })
      return false
    }
    this.slots.push({ id, label, qty })
    this.bus?.emit('item:taken', { id, label })
    this.#emit('add')
    return true
  }

  remove(id, qty = 1) {
    const i = this.slots.findIndex((s) => s.id === id)
    if (i < 0) return false
    this.slots[i].qty -= qty
    if (this.slots[i].qty <= 0) this.slots.splice(i, 1)
    this.#emit('remove')
    return true
  }

  has(id, qty = 1) {
    const slot = this.slots.find((s) => s.id === id)
    return !!slot && slot.qty >= qty
  }

  count(id) {
    return this.slots.find((s) => s.id === id)?.qty ?? 0
  }

  get size() {
    return this.slots.length
  }

  clear() {
    this.slots = []
    this.#emit('clear')
  }

  /** Serialização para o SaveSystem (localStorage). */
  toJSON() {
    return this.slots.map(({ id, label, qty }) => ({ id, label, qty }))
  }

  fromJSON(list) {
    this.slots = Array.isArray(list) ? list.map((s) => ({ ...s })) : []
    this.#emit('load')
    return this
  }

  #emit(reason) {
    this.bus?.emit('inventory:changed', { slots: this.slots.slice(), reason })
  }
}
