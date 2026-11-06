import * as THREE from 'three'
import { PLAYER } from '../core/config.js'

/**
 * Ponto de interesse: qualquer coisa no mundo que aceite "E".
 * O POI não sabe de regras de jogo — ele delega para `ctx.puzzles` /
 * `ctx.inventory` e devolve o que aconteceu (mensagem + ruído + som).
 * Assim a Parte 4 (puzzles) pode reescrever as regras sem tocar no world.
 *
 * Kinds:
 *   item      pegar um item solto
 *   container gaveta/armário: procura, pode ter item (definido pelo PuzzleSystem)
 *   hiding    esconderijo (entrar/sair)
 *   puzzle    abre o desafio (padlock, keypad...) — UI na Parte 5
 *   exit      rota de fuga
 */
export class POI {
  /** @param {{id:string, kind:string, label:string, point:THREE.Vector3, world:object, assets?:object}} opts */
  constructor(opts) {
    this.id = opts.id
    this.kind = opts.kind
    this.label = opts.label ?? opts.kind
    this.item = opts.item ?? null
    this.container = opts.container ?? null
    this.puzzle = opts.puzzle ?? null
    /** Conteúdo garantido: o sorteio da run não pode mudar este item. */
    this.fixed = !!opts.fixed
    this.point = opts.point.clone()
    this.world = opts.world
    this.assets = opts.assets ?? null
    this.door = opts.door ?? null
    this.searched = false
    this.taken = false
    this.hidden = false
    this.enabled = true
    this.range = PLAYER.interactRange
    this.minDot = PLAYER.interactConeDot

    this.object3D = new THREE.Group()
    this.object3D.name = `poi:${this.id}`
    this.#buildVisual()
  }

  get interactable() {
    if (!this.enabled) return false
    if (this.kind === 'item') return !this.taken
    if (this.kind === 'container') return true
    return true
  }

  #buildVisual() {
    if (this.kind === 'item') {
      // Item solto: cápsula emissiva lenta. Vira modelo .glb na Parte 4.
      this.mark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.13, 0),
        new THREE.MeshStandardMaterial({
          color: 0xd8c27a,
          emissive: 0x6a5320,
          emissiveIntensity: 0.9,
          roughness: 0.35,
          metalness: 0.4,
        }),
      )
      this.mark.position.copy(this.point)
      this.object3D.add(this.mark)
      return
    }
    if (this.kind === 'container') {
      this.mark = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.1, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x2e2015, roughness: 0.85 }),
      )
      this.mark.position.copy(this.point).setZ(this.point.z + 0.45)
      this.object3D.add(this.mark)
      return
    }
    if (this.kind === 'hiding') {
      this.mark = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.52, 24),
        new THREE.MeshBasicMaterial({ color: 0x2b3a44, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
      )
      this.mark.rotation.x = -Math.PI / 2
      this.mark.position.set(this.point.x, 0.02, this.point.z)
      this.object3D.add(this.mark)
      return
    }
    if (this.kind === 'puzzle') {
      this.mark = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.4, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x272727, emissive: 0x0d2a1c, roughness: 0.5, metalness: 0.3 }),
      )
      this.mark.position.copy(this.point)
      this.object3D.add(this.mark)
    }
  }

  /**
   * Está na mira e ao alcance? Usado pelo HUD (prompt) e pelo input.
   * @param {{x:number,y:number,z:number,yaw:number}} view
   */
  isFocused(view) {
    if (!this.interactable) return false
    const dx = this.point.x - view.x
    const dy = this.point.y - view.y
    const dz = this.point.z - view.z
    const dist = Math.hypot(dx, dy, dz)
    if (dist > this.range) return false
    // Direção do olhar no plano XZ a partir do yaw da câmera.
    const fx = -Math.sin(view.yaw)
    const fz = -Math.cos(view.yaw)
    const flat = Math.hypot(dx, dz) || 1
    const dot = (dx / flat) * fx + (dz / flat) * fz
    if (dot < this.minDot) return false
    // stopShort: o ponto do POI pode ser a própria porta (saída) — não deixe o
    // painel dela bloquear a própria mira.
    if (!this.world.hasLineOfSight(view, this.point, { step: 0.45, stopShort: 0.3 })) return false
    return { dist }
  }

  /**
   * @param {{inventory?:object, puzzles?:object, noise?:object, audio?:object, player?:object}} ctx
   * @returns {{ok:boolean, message:string, noise:number, sound?:string}}
   */
  interact(ctx = {}) {
    const loud = PLAYER.noise.interact
    switch (this.kind) {
      case 'item': {
        if (this.taken) return { ok: false, message: 'nada aqui', noise: 0 }
        this.taken = true
        if (this.mark) this.mark.visible = false
        ctx.inventory?.add(this.item, this.label)
        ctx.puzzles?.notifyPickup?.(this.item, this.id)
        return { ok: true, message: `pegou: ${this.label}`, item: this.item, noise: loud * 0.7, sound: 'pickup' }
      }
      case 'container': {
        const result = ctx.puzzles?.search?.(this) ?? { found: null }
        this.searched = true
        if (result.found) {
          ctx.inventory?.add(result.found.item, result.found.label)
          return { ok: true, message: `achei: ${result.found.label}`, item: result.found.item, noise: loud, sound: 'drawer' }
        }
        this.mark?.material?.color?.setHex?.(0x1b1410)
        return { ok: true, message: `${this.label}: vazio`, noise: loud * 0.85, sound: 'drawer' }
      }
      case 'hiding': {
        this.hidden = !this.hidden
        ctx.player?.setHidingSpot?.(this.hidden ? this : null)
        return {
          ok: true,
          message: this.hidden ? 'escondido' : 'saindo do esconderijo',
          noise: loud * 0.5,
          sound: this.hidden ? 'hide' : 'unhide',
        }
      }
      case 'puzzle': {
        const opened = ctx.puzzles?.open?.(this)
        return {
          ok: opened !== false,
          message: opened === false ? 'ainda não sei abrir isso' : this.label,
          noise: loud * 0.4,
          sound: 'puzzle',
        }
      }
      case 'exit': {
        const attempt = ctx.puzzles?.attemptEscape?.(this) ?? { ok: true }
        if (attempt.ok) {
          return { ok: true, message: 'a porta abre!', noise: 0.95, sound: 'doorOpen', escape: true }
        }
        return {
          ok: false,
          message: attempt.reason ?? 'trancada',
          noise: attempt.noise ?? 0.2,
          sound: 'denied',
        }
      }
      default:
        return { ok: false, message: 'nada para fazer', noise: 0 }
    }
  }

  update(dt, elapsed) {
    if (!this.mark) return
    if (this.kind === 'item' && !this.taken) {
      this.mark.position.y = this.point.y + Math.sin(elapsed * 1.6) * 0.045
      this.mark.rotation.y = elapsed * 0.8
    }
    if (this.kind === 'hiding') {
      this.mark.material.opacity = this.hidden ? 0.08 : 0.35
    }
  }
}
