import { STR } from './strings.js'
import { DIFFICULTY, DIFFICULTY_ORDER, QUALITY } from '../core/config.js'

const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}

const button = (label, action, opts = {}) => {
  const b = el('button', `btn${opts.primary ? ' btn--primary' : ''}${opts.ghost ? ' btn--ghost' : ''}`)
  b.type = 'button'
  b.textContent = label
  b.dataset.action = action
  if (opts.hint) b.title = opts.hint
  if (opts.disabled) b.disabled = true
  return b
}

const segmented = (label, options, current, action) => {
  const wrap = el('div', 'field')
  wrap.append(el('span', 'field__label', label))
  const group = el('div', 'seg')
  for (const opt of options) {
    const b = el('button', `seg__btn${opt.value === current ? ' is-on' : ''}`, opt.label)
    b.type = 'button'
    b.dataset.action = action
    b.dataset.value = opt.value
    group.append(b)
  }
  wrap.append(group)
  return wrap
}

const slider = (label, action, value, min = 0, max = 1, step = 0.05) => {
  const wrap = el('label', 'field field--slider')
  wrap.append(el('span', 'field__label', label))
  const input = el('input', 'slider')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(value)
  input.dataset.action = action
  wrap.append(input)
  return wrap
}

/**
 * Telas de estado (MENU / PAUSED / CAUGHT / WIN / LOSE).
 * Renderiza HTML, emite `on(action, payload)` e não sabe nada de Three.js.
 */
export class Menus {
  /** @param {{root: HTMLElement, on: (action:string, payload?:any)=>void, state:object}} opts */
  constructor({ root, on, state }) {
    this.root = root
    this.on = on
    this.state = state // settings vivos (difficulty/quality/volumes...)
    this.current = null
    this.root.addEventListener('click', (e) => {
      const node = e.target.closest('[data-action]')
      if (!node) return
      if (node.tagName === 'INPUT') return
      this.on(node.dataset.action, node.dataset.value ?? null)
    })
    this.root.addEventListener('input', (e) => {
      const node = e.target.closest('input[data-action]')
      if (!node) return
      this.on(node.dataset.action, Number(node.value))
    })
  }

  hide() {
    this.root.innerHTML = ''
    this.root.hidden = true
    this.current = null
  }

  show(name, props = {}) {
    this.current = name
    this.root.hidden = false
    this.root.innerHTML = ''
    const card = el('section', `card card--${name}`)
    switch (name) {
      case 'MENU':
        card.append(this.#menu())
        break
      case 'CONTROLS':
        card.append(this.#controls())
        break
      case 'OPTIONS':
        card.append(this.#options())
        break
      case 'PAUSED':
        card.append(this.#paused())
        break
      case 'CAUGHT':
        card.append(this.#caught(props))
        break
      case 'WIN':
        card.append(this.#win(props))
        break
      case 'LOSE':
        card.append(this.#lose(props))
        break
      default:
        return
    }
    this.root.append(card)
  }

  #menu() {
    const wrap = el('div', 'menu')
    wrap.append(el('h1', 'menu__title', STR.title), el('p', 'menu__tag', STR.tagline))
    wrap.append(button(STR.menu.play, 'start', { primary: true }))
    if (this.state.hasSave) wrap.append(button(STR.menu.continue, 'resume-run', { hint: 'retoma o último snapshot local' }))
    wrap.append(button(STR.menu.controls, 'controls'), button(STR.menu.options, 'options'))
    const diff = el('div', 'menu__row')
    diff.append(
      segmented(
        'dificuldade',
        DIFFICULTY_ORDER.filter((value) => DIFFICULTY[value]).map((value) => ({ value, label: DIFFICULTY[value].label })),
        this.state.difficulty,
        'difficulty',
      ),
    )
    const quality = segmented(
      'qualidade',
      Object.keys(QUALITY).map((value) => ({ value, label: value })),
      this.state.quality,
      'quality',
    )
    diff.append(quality)
    wrap.append(diff)
    wrap.append(el('p', 'menu__foot', 'roda no navegador · sem instalar nada · funciona offline depois do primeiro load'))
    return wrap
  }

  #controls() {
    const wrap = el('div', 'panel')
    wrap.append(el('h2', 'panel__title', STR.menu.controls))
    const list = el('dl', 'keys')
    for (const [key, what] of STR.controls) {
      list.append(el('dt', null, key), el('dd', null, what))
    }
    wrap.append(list, button('voltar', 'menu-back', { primary: true }))
    return wrap
  }

  #options() {
    const wrap = el('div', 'panel')
    wrap.append(el('h2', 'panel__title', STR.menu.options))
    wrap.append(
      slider('volume geral', 'volume:master', this.state.volumes.master),
      slider('volume ambiente', 'volume:ambience', this.state.volumes.ambience),
      slider('sensibilidade do mouse', 'sensitivity', this.state.sensitivity, 0.3, 2.5, 0.05),
      slider('brilho', 'brightness', this.state.brightness ?? 1, 0.6, 1.8, 0.05),
    )
    const toggles = el('div', 'menu__row')
    toggles.append(
      segmented('inverter Y', [{ value: '0', label: 'não' }, { value: '1', label: 'sim' }], this.state.invertY ? '1' : '0', 'invertY'),
      segmented('lanterna no escuro', [{ value: '0', label: 'apagada' }, { value: '1', label: 'acesa' }], this.state.lanternStart ? '1' : '0', 'lanternStart'),
    )
    wrap.append(toggles)
    const danger = el('p', 'panel__note', `save local: ${this.state.hasSave ? 'existe (clique para apagar)' : 'vazio'}`)
    wrap.append(danger, button(this.state.hasSave ? 'apagar save' : 'sem save local', 'clear-save', { ghost: true }))
    wrap.append(button('voltar', 'menu-back', { primary: true }))
    return wrap
  }

  #paused() {
    const wrap = el('div', 'panel')
    wrap.append(el('h2', 'panel__title', 'PAUSA'), el('p', 'panel__note', 'a casa espera. ela tem paciência.'))
    wrap.append(button('voltar', 'resume', { primary: true }), button('opções', 'options'), button('sair para o menu', 'quit'))
    return wrap
  }

  #caught({ attemptsLeft = 0, max = 5 }) {
    const wrap = el('div', 'panel')
    wrap.append(el('h2', 'panel__title panel__title--bad', STR.caught.title), el('p', 'panel__body', STR.caught.body))
    wrap.append(el('p', 'panel__count', STR.caught.remaining(attemptsLeft)), button(STR.caught.retry, 'retry', { primary: true }))
    wrap.append(el('p', 'panel__note', `tentativas: ${max - attemptsLeft}/${max}`))
    return wrap
  }

  #win({ seconds = 0, attempts = 0 }) {
    const wrap = el('div', 'panel')
    wrap.append(el('h2', 'panel__title panel__title--good', STR.win.title), el('p', 'panel__body', STR.win.body))
    wrap.append(el('p', 'panel__count', STR.win.time(seconds)))
    wrap.append(el('p', 'panel__note', `capturas na run: ${attempts}`))
    wrap.append(button(STR.win.again, 'restart', { primary: true }), button('menu', 'quit'))
    return wrap
  }

  #lose({ seconds = 0 }) {
    const wrap = el('div', 'panel')
    wrap.append(el('h2', 'panel__title panel__title--bad', STR.lose.title), el('p', 'panel__body', STR.lose.body))
    wrap.append(el('p', 'panel__note', `você passou ${Math.round(seconds / 60)} minutos lá dentro`))
    wrap.append(button(STR.lose.restart, 'restart', { primary: true }), button('menu', 'quit'))
    return wrap
  }

  /** Só o texto da tela de loading (usado pelas etapas do boot). */
  setLabel(text) {
    const node = document.getElementById('loading-label')
    if (node && text) node.textContent = text
  }

  /** Loading (tela própria, fora da máquina de estados visual). */
  setLoading(progress, label) {
    const fill = document.getElementById('loading-fill')
    const text = document.getElementById('loading-label')
    if (fill) fill.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`
    if (text && label) text.textContent = label
  }

  hideLoading() {
    const node = document.getElementById('loading')
    if (!node) return
    node.classList.add('is-done')
    setTimeout(() => {
      node.classList.remove('is-done')
      // hidden + display: o atributo sozinho nao vence `.loading{display:grid}`
      // (regra de autor > folha do navegador), entao garantimos os dois.
      node.hidden = true
      node.style.display = 'none'
      node.remove()
    }, 420)
  }
}
