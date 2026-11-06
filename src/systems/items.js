/**
 * Catálogo de itens. A Parte 4 (puzzles) amplia; por enquanto existe o mínimo
 * para a casa do floor plan fazer sentido. Cada item declara `usable` e, se
 * aplicável, o que ele `unlocks` — o PuzzleSystem só lê daqui.
 */
export const ITEMS = Object.freeze({
  flashlight: Object.freeze({ label: 'lanterna', glyph: '🔦', usable: true, unlocks: null }),
  key_hall: Object.freeze({ label: 'chave mestra', glyph: '🗝', usable: false, unlocks: 'padlock' }),
  padlock_code: Object.freeze({ label: 'bilhete com o código', glyph: '📝', usable: false, unlocks: 'padlock' }),
  bolt_cutters: Object.freeze({ label: 'alicate de corte', glyph: '✂', usable: false, unlocks: 'basement' }),
  /** Primeiro micro-puzzle do jogo (doc Parte 2 §1): abre o quarto inicial. */
  key_room: Object.freeze({ label: 'chave do quarto', glyph: '🔑', usable: false, unlocks: 'start_room' }),
  battery: Object.freeze({ label: 'pilha', glyph: '🔋', usable: true, unlocks: null }),
  /**
   * Óleo (doc §6.4): remove para sempre o rangido de uma tábua.
   * `uses` = aplicações por frasco.
   */
  oil: Object.freeze({ label: 'óleo lubrificante', glyph: '🫙', usable: true, unlocks: null, uses: 3 }),
  /** Item de distração (doc §6.6): arremessar puxa a atenção da IA. */
  jar: Object.freeze({ label: 'pote de vidro', glyph: '🫙', usable: false, unlocks: null, throwable: true }),
})

/** Itens que o sorteio de início de run pode espalhar pela casa. */
export const LOOT_POOL = ['flashlight', 'key_hall', 'padlock_code', 'battery', 'bolt_cutters']

export function itemLabel(id) {
  return ITEMS[id]?.label ?? id
}

export function itemGlyph(id) {
  return ITEMS[id]?.glyph ?? '•'
}
