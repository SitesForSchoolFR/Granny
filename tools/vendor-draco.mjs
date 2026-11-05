/**
 * Copia o decoder Draco do three para public/vendor/draco (self-hosted — nada
 * de CDN em jogo de GitHub Pages). Roda como `prebuild`, então o build do CI
 * sempre tem o decoder quando algum modelo declarar `draco: true`.
 *
 * Se nenhum modelo usar Draco, a pasta não é necessária (o loader só habilita o
 * DRACOLoader sob demanda) — por isso o arquivo ausente é aviso, não erro.
 */
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/three/examples/jsm/libs/draco/gltf')
const dest = join(root, 'public/vendor/draco')

if (!existsSync(src)) {
  console.warn('[vendor:draco] three não encontrado em node_modules — rode npm install primeiro')
  process.exit(0)
}

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
writeFileSync(
  join(dest, 'README.md'),
  'Gerado por `npm run vendor:draco` a partir do pacote `three` (licença MIT).\nNão commitar: o build do Pages regenerate isto.\n',
)

const files = ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']
let bytes = 0
for (const f of files) {
  try {
    bytes += statSync(join(dest, f)).size
  } catch {
    console.warn(`[vendor:draco] ${f} ausente — modelos draco:true vão falhar`)
  }
}
console.log(`[vendor:draco] public/vendor/draco pronto (${Math.round(bytes / 1024)} kB)`)
