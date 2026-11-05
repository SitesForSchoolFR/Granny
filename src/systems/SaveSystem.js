import { SAVE } from '../core/config.js'

/**
 * Persistência em localStorage (doc Parte 1, seção 2).
 * Escopo: progresso DENTRO de uma sessão/run + um snapshot de debug.
 * Nada de save "eterno" de campanha — stealth run-based, morrer reinicia.
 *
 * Regras:
 *  - chave com schemaVersion: se o schema mudar, `load()` descarta (nunca crash);
 *  - try/catch em tudo: modo privado, quota cheia e Pages em iframe podem falhar;
 *  - o payload é JSON puro (Vector3 vira {x,y,z}).
 */
export class SaveSystem {
  constructor({ storage, key = SAVE.key, schemaVersion = SAVE.schemaVersion } = {}) {
    this.key = key
    this.schemaVersion = schemaVersion
    this.lastError = null
    try {
      this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)
    } catch {
      this.storage = null
    }
  }

  get available() {
    return !!this.storage
  }

  save(state) {
    if (!this.storage) return false
    try {
      const payload = { v: this.schemaVersion, at: Date.now(), state }
      this.storage.setItem(this.key, JSON.stringify(payload))
      this.lastError = null
      return true
    } catch (err) {
      this.lastError = err?.message ?? String(err)
      console.warn('[save] não consegui salvar:', this.lastError)
      return false
    }
  }

  load() {
    if (!this.storage) return null
    try {
      const raw = this.storage.getItem(this.key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.v !== this.schemaVersion) {
        console.info('[save] schema antigo — descartando')
        this.clear()
        return null
      }
      return parsed
    } catch (err) {
      this.lastError = err?.message ?? String(err)
      this.clear()
      return null
    }
  }

  clear() {
    if (!this.storage) return false
    try {
      this.storage.removeItem(this.key)
      return true
    } catch {
      return false
    }
  }

  /** Instantâneo de debug: `?debug=1` + botão no menu → ver o estado no console. */
  snapshot(parts) {
    const data = {
      at: new Date().toISOString(),
      ...parts,
    }
    this.save(data)
    return data
  }

  describe() {
    return {
      available: this.available,
      key: this.key,
      size: this.storage?.getItem(this.key)?.length ?? 0,
      lastError: this.lastError,
    }
  }
}
