/**
 * Manifesto de assets.
 *
 * Regra de ouro para o GitHub Pages (doc Parte 1, seção 5):
 *   - assets em public/  ->  url = `${import.meta.env.BASE_URL}...`
 *     (NUNCA '/textures/wall.webp': path absoluto quebra em /NomeDoRepo/)
 *   - assets importados junto do código -> new URL('../textures/x.webp', import.meta.url)
 *
 * Cada entrada é opcional: se o arquivo ainda não foi commitado, o loader
 * registra omissa e o sistema usa o gerador procedural correspondente.
 * Assim o jogo nunca quebra por asset faltando — só fica mais feio.
 */
export const manifest = {
  models: [
    // { id: 'granny', path: 'models/granny.glb', draco: true, castShadow: true },
    // { id: 'chair',  path: 'models/chair.glb' },
  ],
  textures: [
    // { id: 'wall',   path: 'textures/wallpaper.webp', size: 1024, repeat: [4, 2] },
    // { id: 'floor',  path: 'textures/floorboards.webp', size: 1024, repeat: [6, 6] },
    // { id: 'ceiling',path: 'textures/plaster.webp', size: 512, repeat: [6, 6] },
    // { id: 'door',   path: 'textures/door.webp', size: 512 },
  ],
  audio: [
    // { id: 'footstep_wood', path: 'audio/footstep_wood.mp3' },
    // { id: 'creak',         path: 'audio/door_creak.mp3' },
    // { id: 'heartbeat',     path: 'audio/heartbeat.mp3' },
    // { id: 'drone',         path: 'audio/ambience_drone.ogg' },
  ],
}

/**
 * Resolve o caminho público de um asset respeitando a base do Pages.
 * `?debug=1` imprime cada URL resolvida — é o primeiro log que olhar em caso de 404.
 */
export function publicUrl(path) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  const clean = String(path).replace(/^\.?\//, '')
  return `${base}/${clean}`
}
