import * as THREE from 'three'
import { HOUSE } from '../core/config.js'

/**
 * Porta articulada. Estado binário (aberta/fechada) + flag `locked`.
 *  - fechada => colisor ativo (bloqueia corpo E linha de visão);
 *  - aberta  => colisor removido, o vão volta a ser passagem;
 *  - ranger  => quem decide o volume é o NoiseSystem (gancho da Parte 2).
 *
 * A porta nunca empurra o jogador: fechar em cima de um corpo no vão é
 * cancelado (toggle retorna `reason: 'blocked'`), mais legível do que
 * resolver interpenetração.
 */
export class Door {
  /**
   * @param {{
   *   id: string,
   *   center: {x:number,z:number},
   *   spanAxis: 'x'|'z',
   *   world: object,
   *   material?: THREE.Material,
   *   locked?: boolean,
   *   label?: string,
   *   swingSign?: number,
   *   onToggled?: (door: Door) => void
   * }} opts
   */
  constructor(opts) {
    this.id = opts.id
    this.center = opts.center
    /** Eixo ao longo do vão: 'x' = parede que corre no eixo Z, e vice-versa. */
    this.spanAxis = opts.spanAxis
    this.world = opts.world
    this.label = opts.label ?? 'porta'
    this.locked = !!opts.locked
    /** Id do item que abre esta porta (null = tranca só por puzzle). */
    this.requires = opts.requires ?? null
    this.cell = opts.cell ?? null
    this.isOpen = false
    this.onToggled = opts.onToggled
    this.swingSign = opts.swingSign ?? 1
    this.creak = 0.55 // loudness base do rangido (0..1)
    this.anim = { target: 0, current: 0, speed: 3.4 }

    const cell = HOUSE.cell
    const width = cell - HOUSE.wallThickness
    const height = HOUSE.wallHeight * 0.9
    const thickness = 0.075
    const half = width / 2

    this.material = opts.material ?? new THREE.MeshStandardMaterial({ color: 0x4a3620, roughness: 0.9 })

    // O pivô fica NA DOBRADIÇA, então girar em Y é o swing real da folha.
    this.pivot = new THREE.Group()
    this.pivot.name = `door:${this.id}`
    if (this.spanAxis === 'x') {
      this.pivot.position.set(this.center.x - half, 0, this.center.z)
    } else {
      this.pivot.position.set(this.center.x, 0, this.center.z - half)
    }

    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), this.material)
    if (this.spanAxis === 'x') panel.position.set(half, height / 2, 0)
    else {
      panel.position.set(0, height / 2, half)
      panel.rotation.y = Math.PI / 2
    }
    panel.receiveShadow = true
    this.panel = panel
    this.pivot.add(panel)

    const hardware = new THREE.MeshStandardMaterial({ color: 0x8a7a52, metalness: 0.7, roughness: 0.4 })
    this.handle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.22), hardware)
    this.handle.position.set(width * 0.4, -height * 0.05, thickness / 2 + 0.03)
    panel.add(this.handle)

    // Badge de tranca: sinal visual imediato de "isso aqui ainda não abre".
    this.lockBadge = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.17, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x5c1a12, emissive: 0x40100a, roughness: 0.6 }),
    )
    this.lockBadge.position.set(width * 0.4, height * 0.14, thickness / 2 + 0.03)
    this.lockBadge.visible = this.locked
    panel.add(this.lockBadge)

    /** Colisor do painel: cobre o vão todo (swing visual não afeta colisão). */
    const boxHalf =
      this.spanAxis === 'x'
        ? { x: half, y: height / 2, z: thickness / 2 + 0.03 }
        : { x: thickness / 2 + 0.03, y: height / 2, z: half }
    this.colliderId = this.world.addBox(
      { x: this.center.x, y: height / 2, z: this.center.z },
      boxHalf,
      'door',
    )
  }

  setLocked(locked) {
    this.locked = !!locked
    this.lockBadge.visible = this.locked
  }

  /**
   * Tenta abrir a tranca com um item (doc §1: cadeado simples do quarto
   * inicial). Não abre a porta — só destranca, para o jogador decidir.
   * @param {{has:(id:string)=>boolean}} inventory
   */
  unlockWith(inventory) {
    if (!this.locked) return { ok: true, reason: 'já aberta' }
    if (!this.requires) return { ok: false, reason: 'sem chave que sirva' }
    if (!inventory?.has?.(this.requires)) return { ok: false, reason: 'falta a chave', item: this.requires }
    this.setLocked(false)
    return { ok: true, item: this.requires }
  }

  /** @returns {{ok:boolean, open:boolean, loudness:number, reason?:string}} */
  toggle() {
    if (this.locked && !this.isOpen) return { ok: false, open: false, loudness: 0.1, reason: 'locked' }
    this.isOpen = !this.isOpen
    this.anim.target = this.isOpen ? 1 : 0
    this.world.setBoxEnabled(this.colliderId, !this.isOpen)
    // Fechar com força range mais que abrir devagar.
    const loudness = this.isOpen ? this.creak * 0.8 : this.creak
    this.onToggled?.(this)
    return { ok: true, open: this.isOpen, loudness }
  }

  /** @returns {boolean} true enquanto a animação está em curso */
  update(dt) {
    const diff = this.anim.target - this.anim.current
    if (Math.abs(diff) < 1e-4) {
      this.anim.current = this.anim.target
      return false
    }
    this.anim.current += Math.sign(diff) * Math.min(Math.abs(diff), dt * this.anim.speed)
    this.pivot.rotation.y = this.anim.current * (Math.PI / 2) * this.swingSign
    return true
  }

  /** Ponto de mira/áudio da porta (usado pelo POI e pelo PannerNode). */
  get focusPoint() {
    return new THREE.Vector3(this.center.x, 1.15, this.center.z)
  }

  get object3D() {
    return this.pivot
  }
}
