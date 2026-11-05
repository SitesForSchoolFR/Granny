import { Ev } from '../core/events.js'
import { STR } from './strings.js'
import { itemGlyph, itemLabel } from '../systems/items.js'

const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}

/**
 * HUD em DOM (não em canvas): texto nítido em qualquer DPR, sem custo de
 * rasterização por frame, e sobrevive a troca de qualidade 3D.
 * Só lê eventos e um snapshot por frame — nunca tem referência ao Player/AI.
 */
export class HUD {
  /** @param {{root: HTMLElement, bus: import('../core/events.js').EventBus}} opts */
  constructor({ root, bus }) {
    this.root = root
    this.bus = bus
    this.debug = false
    this.toastTimer = 0
    this.focus = null
    this.arrowAngle = 0
    this.build()
    this.#wire()
  }

  build() {
    this.root.innerHTML = ''

    this.crosshair = el('div', 'crosshair')
    this.crosshair.append(el('i', 'crosshair__dot'))
    this.prompt = el('div', 'prompt')
    this.prompt.append(el('b', 'prompt__key', 'E'), (this.promptLabel = el('span', 'prompt__text')))

    this.threat = el('div', 'threat')
    this.threat.append((this.threatText = el('span', 'threat__label')))

    this.vitals = el('div', 'vitals')
    this.lives = el('div', 'lives')
    this.noise = el('div', 'noise')
    this.noise.append(el('span', 'noise__label', 'ruído'), (this.noiseBar = el('i', 'noise__fill')))
    this.compass = el('div', 'compass')
    this.compass.append((this.compassArrow = el('i', 'compass__arrow', '▲')))
    this.stance = el('div', 'stance')
    this.vitals.append(this.lives, this.noise, this.compass, this.stance)

    this.objectives = el('div', 'objectives')
    this.objectives.append(el('h3', 'objectives__title'), (this.objectiveList = el('ul', 'objectives__list')))
    this.objectiveBar = el('div', 'objectives__bar')
    this.objectiveBar.append((this.objectiveFill = el('i')))
    this.objectives.append(this.objectiveBar)

    this.inventory = el('div', 'inventory')

    this.toasts = el('div', 'toasts')

    this.debugPanel = el('pre', 'debug')
    this.debugPanel.hidden = true

    this.root.append(
      this.crosshair,
      this.prompt,
      this.threat,
      this.vitals,
      this.objectives,
      this.inventory,
      this.toasts,
      this.debugPanel,
      (this.vignette = el('div', 'vignette')),
      (this.flash = el('div', 'flash')),
    )
  }

  #wire() {
    const b = this.bus
    b.on(Ev.HUD_TOAST, (p) => this.toast(p.text, p.kind))
    b.on('ui:toast', (p) => this.toast(p.text, p.kind))
    b.on(Ev.POI_FOCUS, ({ poi }) => this.setFocus(poi))
    b.on(Ev.PUZZLE_PROGRESS, (p) => this.setObjectives(p))
    b.on(Ev.PUZZLE_SOLVED, () => this.flashScreen('good'))
    b.on('player:damaged', () => this.flashScreen('bad'))
    b.on(Ev.PLAYER_STANCE, ({ stance }) => this.setStance(stance))
    b.on(Ev.AI_STATE, ({ to }) => this.setThreat(to))
    b.on(Ev.NOISE_EMIT, (n) => this.setNoise(n))
    b.on('inventory:changed', ({ slots }) => this.setInventory(slots))
    b.on(Ev.STATE_CHANGED, ({ to }) => {
      const live = to === 'PLAYING'
      this.root.hidden = !live
      if (!live) this.prompt.hidden = true
    })
  }

  setEnabled(on) {
    this.root.classList.toggle('hud--hidden', !on)
  }

  setDebug(on) {
    this.debug = !!on
    this.debugPanel.hidden = !this.debug
  }

  setFocus(poi) {
    this.focus = poi ?? null
    if (!poi) {
      this.prompt.hidden = true
      this.crosshair.classList.remove('crosshair--focus')
      return
    }
    this.prompt.hidden = false
    this.promptLabel.textContent = this.#promptFor(poi)
    this.crosshair.classList.add('crosshair--focus')
  }

  #promptFor(poi) {
    switch (poi.kind) {
      case 'item':
        return `${STR.prompt.take} ${poi.label}`
      case 'container':
        return poi.searched ? `${STR.prompt.search} de novo` : `${STR.prompt.search} ${poi.label}`
      case 'hiding':
        return poi.hidden ? STR.prompt.unhide : STR.prompt.hide
      case 'exit':
        return poi.door?.locked ? `${STR.prompt.open} ${poi.label} (${STR.prompt.locked})` : `${STR.prompt.open} ${poi.label}`
      default:
        return `${STR.prompt.examine} ${poi.label}`
    }
  }

  setObjectives(progress) {
    this.objectiveList.innerHTML = ''
    for (const obj of progress.objectives) {
      const li = el('li', obj.ok ? 'is-done' : '')
      li.append(el('i', 'bullet'), el('span', null, obj.label))
      this.objectiveList.append(li)
    }
    this.objectiveFill.style.width = `${Math.round(progress.ratio * 100)}%`
    this.objectives.querySelector('h3').textContent = STR.objective(progress.done, progress.total)
  }

  setLives(remaining, max) {
    this.lives.innerHTML = ''
    for (let i = 0; i < max; i += 1) {
      this.lives.append(el('i', `heart${i < remaining ? '' : ' heart--gone'}`, '♥'))
    }
  }

  setStance(stance) {
    const label =
      stance === 'crouch' ? STR.status.crouch : stance === 'sprint' ? STR.status.sprint : stance === 'hidden' ? STR.status.hidden : ''
    this.stance.textContent = label
    this.stance.classList.toggle('stance--warn', stance === 'sprint')
  }

  setThreat(state) {
    const spotted = state === 'CHASE'
    this.threat.classList.toggle('threat--hot', spotted)
    this.threatText.textContent = spotted ? STR.status.spotted : state === 'INVESTIGATE' || state === 'SEARCH' ? STR.status.heard : ''
  }

  setNoise(noise) {
    if (noise.source !== 'player') return
    this.noiseBar.style.width = `${Math.round(noise.loudness * 100)}%`
    this.noise.classList.add('noise--ping')
    setTimeout(() => this.noise.classList.remove('noise--ping'), 260)
  }

  setInventory(slots) {
    this.inventory.innerHTML = ''
    for (const slot of slots) {
      const chip = el('div', 'chip')
      chip.append(el('span', 'chip__glyph', itemGlyph(slot.id)), el('span', 'chip__label', itemLabel(slot.id)))
      if (slot.qty > 1) chip.append(el('b', 'chip__qty', `×${slot.qty}`))
      this.inventory.append(chip)
    }
  }

  toast(text, kind = 'info') {
    if (!text) return
    const node = el('div', `toast toast--${kind}`, text)
    this.toasts.append(node)
    requestAnimationFrame(() => node.classList.add('is-in'))
    setTimeout(() => {
      node.classList.remove('is-in')
      setTimeout(() => node.remove(), 320)
    }, 2200)
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove()
  }

  flashScreen(kind) {
    this.flash.className = `flash flash--${kind}`
    this.flash.classList.add('is-on')
    setTimeout(() => this.flash.classList.remove('is-on'), 240)
  }

  /** Chamado no render (interpolado), não no tick fixo. */
  renderFrame(data) {
    this.vignette.style.setProperty('--danger', String(data.danger ?? 0))
    this.noiseBar.style.opacity = String(0.35 + 0.65 * (data.noiseMeter ?? 0))
    if (data.lastNoiseAngle != null) {
      this.compassArrow.style.transform = `rotate(${data.lastNoiseAngle}rad)`
      this.compass.classList.toggle('compass--on', true)
    } else {
      this.compass.classList.remove('compass--on')
    }
    if (this.debug) {
      this.debugPanel.textContent = data.debugText ?? ''
    }
  }
}
