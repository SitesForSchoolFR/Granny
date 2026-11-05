import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { EventBus, Ev } from './events.js'
import { manifest, publicUrl } from './manifest.js'
import {
  floorboardTexture,
  plasterTexture,
  wallpaperTexture,
  woodPanelTexture,
} from './procedural.js'

/**
 * Loader de assets com fallback procedural e progresso para a tela de LOADING.
 *
 * Política deliberada para GitHub Pages:
 *  - .glb sempre com Draco quando `draco: true` no manifesto;
 *  - textura ausente/falha => gerador procedural do mesmo slot;
 *  - áudio ausente/falha => sintetizador do AudioSystem (mesmo nome de chave);
 *  - NADA aqui pode lançar em produção: asset faltando é warning, não crash.
 */
export class AssetLoader {
  /** @param {{ bus?: EventBus, renderer?: THREE.WebGLRenderer }} [options] */
  constructor({ bus, renderer } = {}) {
    this.bus = bus ?? new EventBus()
    this.renderer = renderer ?? null
    /** @type {Map<string, THREE.Texture>} */
    this.textures = new Map()
    /** @type {Map<string, THREE.Group>} */
    this.models = new Map()
    /** @type {Map<string, AudioBuffer>} */
    this.audioBuffers = new Map()
    /** @type {Set<string>} ids que caíram para placeholder */
    this.placeholders = new Set()
    this.total = 1
    this.done = 0
    this.failed = []

    this.textureLoader = new THREE.TextureLoader()
    this.gltfLoader = new GLTFLoader()
    this.draco = null
  }

  /**
   * Draco só é habilitado se alguém declarar `draco: true` no manifesto, porque
   * o decoder self-hosted custa ~750 kB no bundle (ver docs/GITHUB_PAGES.md):
   * preferir `gltf-transform quantize` / meshopt para modelos pequenos.
   * Rode `npm run vendor:draco` para copiar o decoder para public/vendor/draco.
   */
  #enableDraco() {
    if (this.draco || !manifest.models.some((m) => m.draco)) return
    this.draco = new DRACOLoader()
    this.draco.setDecoderPath(publicUrl('vendor/draco/'))
    this.draco.setDecoderConfig({ type: 'js' })
    this.gltfLoader.setDRACOLoader(this.draco)
  }

  get progress() {
    return Math.min(1, this.done / this.total)
  }

  report(label) {
    this.bus.emit(Ev.LOADING_PROGRESS, { progress: this.progress, label })
  }

  /** @returns {Promise<void>} */
  async load() {
    this.#enableDraco()
    const jobs = []
    const aniso = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1

    for (const entry of manifest.textures) {
      jobs.push(
        this._try(`textura ${entry.id}`, async () => {
          const tex = await this._loadTexture(publicUrl(entry.path), aniso)
          if (entry.repeat) tex.repeat.set(entry.repeat[0], entry.repeat[1])
          this.textures.set(entry.id, tex)
        }),
      )
    }

    for (const entry of manifest.models) {
      jobs.push(
        this._try(`modelo ${entry.id}`, async () => {
          const gltf = await this.gltfLoader.loadAsync(publicUrl(entry.path), (e) => {
            if (e.total) this.report(`modelo ${entry.id} ${Math.round((e.loaded / e.total) * 100)}%`)
          })
          const root = gltf.scene ?? gltf.scenes?.[0]
          if (!root) throw new Error('glb sem cena')
          root.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = entry.castShadow !== false
              o.receiveShadow = true
              if (o.material) o.material.flatShading = !!entry.flatShading
            }
          })
          this.models.set(entry.id, root)
        }),
      )
    }

    for (const entry of manifest.audio) {
      jobs.push(
        this._try(`áudio ${entry.id}`, async () => {
          const res = await fetch(publicUrl(entry.path))
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const buf = await res.arrayBuffer()
          const ctx = this.audioContext
          if (!ctx) throw new Error('AudioContext indisponível — áudio sintetizado no lugar')
          const decoded = await ctx.decodeAudioData(buf.slice(0))
          this.audioBuffers.set(entry.id, decoded)
        }),
      )
    }

    this.total = Math.max(1, jobs.length + 1)
    await Promise.all(jobs)
    this._ensureProceduralTextures(aniso)
    this.done = this.total
    this.report('pronto')
    this.bus.emit(Ev.LOADING_DONE, { failed: this.failed.slice(), placeholders: [...this.placeholders] })
    this.draco?.dispose()
  }

  async _try(label, fn) {
    try {
      await fn()
    } catch (err) {
      this.failed.push(label)
      console.warn(`[assets] ${label} indisponível (${err?.message ?? err}) — usando placeholder`)
    } finally {
      this.done += 1
      this.report(label)
    }
  }

  _loadTexture(url, anisotropy) {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = anisotropy
          tex.wrapS = THREE.RepeatWrapping
          tex.wrapT = THREE.RepeatWrapping
          resolve(tex)
        },
        undefined,
        (err) => reject(err instanceof Error ? err : new Error('falha de load')),
      )
    })
  }

  /** Slots fixos que o resto do código sempre pode pedir, com ou sem arte final. */
  _ensureProceduralTextures(anisotropy) {
    const fallbacks = {
      wall: () => wallpaperTexture({ repeat: 3, anisotropy }),
      floor: () => floorboardTexture({ repeat: 4, anisotropy }),
      ceiling: () => plasterTexture({ repeat: 4, anisotropy }),
      door: () => woodPanelTexture({ repeat: 1, anisotropy }),
    }
    for (const [id, make] of Object.entries(fallbacks)) {
      if (this.textures.has(id)) continue
      const tex = make()
      if (tex) {
        this.textures.set(id, tex)
        this.placeholders.add(id)
      }
    }
  }

  /** @param {string} id @param {number} repeat */
  texture(id, repeat) {
    const tex = this.textures.get(id)
    if (tex && Number.isFinite(repeat) && repeat > 0) tex.repeat.set(repeat, repeat / 2)
    return tex ?? null
  }

  hasModel(id) {
    return this.models.has(id)
  }

  model(id) {
    return this.models.get(id) ?? null
  }

  /** Clonagem barata (compartilha geometria/material) para espalhar props pela casa. */
  instantiate(id) {
    const src = this.model(id)
    return src ? src.clone(true) : null
  }

  hasSound(id) {
    return this.audioBuffers.has(id)
  }

  sound(id) {
    return this.audioBuffers.get(id) ?? null
  }

  /** Estatísticas para o overlay de debug. */
  stats() {
    return {
      textures: this.textures.size,
      models: this.models.size,
      sounds: this.audioBuffers.size,
      placeholders: this.placeholders.size,
      failed: this.failed.length,
    }
  }
}
