/**
 * FLOOR PLAN — planta da casa em grade (1 célula = HOUSE.cell = 3 m).
 *
 * Legenda:
 *   '#'  parede sólida          '.'  chão livre
 *   'D'  porta interna (abre/fecha, range)
 *   'E'  porta da frente = rota de fuga (nasce trancada, mora na borda)
 *   'S'  spawn do jogador       'G'  spawn da Granny
 *   '1'..'7' slot de ponto de interesse — o conteúdo de cada slot é definido
 *            em POI_SLOTS e sorteado pelo PuzzleSystem a cada run.
 *
 * Por que grade e não .glb da casa:
 *  - colisão/LOS = lookup O(1) na grade, sem engine de física;
 *  - level design revisável em diff de texto;
 *  - geometria gerada em runtime = 0 bytes baixados (limite do Pages).
 *
 * O parser NORMALIZA as linhas (padding com '#') e fecha a borda, exceto nas
 * células de porta. Então erro de contagem nunca "vaza" uma parede — no máximo
 * fecha uma passagem, e o teste de grafo conexo abaixo (npm run smoke) reclama.
 */
export const MAP_ROWS = [
  '#####################',
  // Quarto inicial (x1-3, z1-3): 3x3 células, fechado. A única saída é a
  // porta trancada em (4,2) — primeiro micro-puzzle do jogo (doc §1).
  '#.8.#.....#.........#',
  // S = onde acorda. A porta do quarto (D) fica NA MESMA LINHA do spawn:
  // andar para frente já encara o vão, em vez de bater na quina.
  '#.S.D..1..#....2....#',
  '#...#.....#.........#',
  '#######D#######D#####',
  '#...................#',
  // S = spawn do jogador (quarto inicial); G = spawn da Granny (corredor).
  '#.............G.....#',
  '###D#######D#####D###',
  '#.........#.........#',
  '#....3....#....4....#',
  '#.........#.........#',
  '####D######D####D####',
  '#.......#.....#.....#',
  '#..5.6..#.....#..7..#',
  '#.......#.....#.....#',
  '###########E#########',
]

/** Cômodos (x0/z0 inclusivos, x1/z1 exclusivos) — usados por patrulha da IA e textos de objetivo. */
export const ROOMS = [
  { id: 'start', label: 'Quarto inicial', x0: 1, x1: 4, z0: 1, z1: 4 },
  { id: 'bedroom', label: 'Quarto', x0: 5, x1: 10, z0: 1, z1: 4 },
  { id: 'study', label: 'Escritório', x0: 11, x1: 20, z0: 1, z1: 4 },
  { id: 'hall', label: 'Corredor', x0: 1, x1: 20, z0: 5, z1: 7 },
  { id: 'kitchen', label: 'Cozinha', x0: 1, x1: 10, z0: 8, z1: 11 },
  { id: 'living', label: 'Sala', x0: 11, x1: 20, z0: 8, z1: 11 },
  { id: 'pantry', label: 'Despensa', x0: 1, x1: 8, z0: 12, z1: 15 },
  { id: 'dining', label: 'Sala de jantar', x0: 9, x1: 14, z0: 12, z1: 15 },
  { id: 'bathroom', label: 'Banheiro', x0: 15, x1: 20, z0: 12, z1: 15 },
  { id: 'porch', label: 'Varanda', x0: 11, x1: 12, z0: 15, z1: 16, outside: true },
]

/**
 * Conteúdo de cada marcador. `kind` é interpretado por POI.js; os itens
 * obrigatórios da fuga são REALOCADOS pelo PuzzleSystem a cada run, então o
 * `item` abaixo é só o padrão para quando o puzzle system está desligado.
 */
export const POI_SLOTS = {
  1: { kind: 'item', item: 'flashlight', label: 'lanterna' },
  2: { kind: 'container', container: 'desk', label: 'gaveta da escrivaninha' },
  3: { kind: 'container', container: 'drawer', label: 'gaveta da cozinha' },
  4: { kind: 'container', container: 'drawer', label: 'aparador da sala' },
  5: { kind: 'container', container: 'cabinet', label: 'armário da despensa' },
  // Esconderijo numa célula SEM móvel: o ponto do POI é o centro da célula e o
  // jogador encosta até hideRadius dele — se houvesse colisor ali, a resolução
  // de colisão o empurraria para fora do esconderijo.
  6: { kind: 'hiding', label: 'fundo da despensa' },
  7: { kind: 'container', container: 'cabinet', label: 'armário do banheiro' },
  // `fixed`: o PuzzleSystem NÃO realoca este item no sorteio da run — a chave
  // do quarto inicial tem que estar sempre no quarto inicial.
  8: { kind: 'container', container: 'drawer', label: 'criado-mudo', item: 'key_room', fixed: true },
  S: { kind: 'spawn', who: 'player' },
  G: { kind: 'spawn', who: 'granny' },
  E: { kind: 'exit', label: 'porta da frente' },
}

/** Móveis: célula central, tamanho em célula e altura. Bloqueiam visão e corpo. */
export const PROPS = [
  // Quarto inicial: a cama de onde o jogador acorda (doc Parte 2 §1); o
  // criado-mudo ao lado é o POI_SLOTS[8], onde a chave sempre está.
  { room: 'start', at: [0, 0], size: [1.4, 0.9], height: 0.5, label: 'cama' },
  { room: 'bedroom', at: [2, 1], size: [2, 1.2], height: 0.55, label: 'cama' },
  { room: 'bedroom', at: [7, 1], size: [1, 1], height: 1.7, label: 'guarda-roupa' },
  { room: 'study', at: [13, 2], size: [2, 1], height: 0.78, label: 'escrivaninha' },
  { room: 'study', at: [18, 1], size: [1.2, 0.9], height: 1.8, label: 'estante' },
  { room: 'kitchen', at: [2, 9], size: [3, 0.8], height: 0.9, label: 'bancada' },
  { room: 'kitchen', at: [8, 10], size: [1, 1], height: 1.75, label: 'geladeira' },
  { room: 'living', at: [17, 9], size: [2.4, 1.1], height: 0.45, label: 'sofá' },
  { room: 'living', at: [12, 8], size: [1.8, 0.7], height: 0.9, label: 'aparador' },
  { room: 'pantry', at: [2, 13], size: [1.2, 1.2], height: 1.8, label: 'prateleira' },
  { room: 'dining', at: [11, 13], size: [1.8, 1.2], height: 0.75, label: 'mesa de jantar' },
  { room: 'bathroom', at: [16, 13], size: [1.6, 0.9], height: 0.85, label: 'pia' },
]

export const MAP_WIDTH = Math.max(...MAP_ROWS.map((r) => r.length))
export const MAP_HEIGHT = MAP_ROWS.length

/**
 * Trancas por célula de porta: { 'cx,cz': itemQueAbre }.
 * A do quarto inicial é o primeiro micro-puzzle (doc §1); a da frente continua
 * sendo a condição de vitória, resolvida pelo PuzzleSystem.
 */
export const DOOR_LOCKS = Object.freeze({
  '4,2': 'key_room',
})

/**
 * Tábuas barulhentas (doc §4): pisar aqui denuncia o jogador mesmo agachado.
 * Parte 3 detalha como a Granny interpreta o ruído; aqui só a marcação.
 */
export const CREAKY_BOARDS = Object.freeze([
  { cx: 6, cz: 6, loudness: 0.85 },
  { cx: 12, cz: 6, loudness: 0.8 },
  { cx: 9, cz: 9, loudness: 0.9 },
  { cx: 11, cz: 13, loudness: 0.75 },
])
