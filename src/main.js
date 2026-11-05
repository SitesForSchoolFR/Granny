import { Game } from './core/Game.js'

/**
 * Ponto de entrada. Tudo que existe aqui é: achar os nós do DOM, instanciar o
 * Game e matê-lo com dignidade. A lógica vive em src/core/Game.js.
 */
const params = new URLSearchParams(window.location.search)

const canvas = document.getElementById('scene')
const hudRoot = document.getElementById('hud')
const screensRoot = document.getElementById('screens')

const game = new Game({ canvas, hudRoot, screensRoot, params })
window.game = game // console: game.debugText(), game.save.snapshot(...)

function fatal(err) {
  console.error('[escape-house] boot falhou', err)
  const box = document.getElementById('loading')
  if (!box) return
  box.classList.add('is-error')
  box.innerHTML = `
    <div class="loading__inner">
      <p class="loading__title">A CASA NÃO ABRIU</p>
      <p class="loading__label">${escapeHtml(String(err?.message ?? err))}</p>
      <p class="loading__hint">WebGL desabilitado, driver antigo ou build quebrado.
      Tente <code>?quality=low</code> na URL.</p>
    </div>`
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

// WebGL é o pré-requisito real do jogo — avisar antes de estourar stack trace.
function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

if (!hasWebGL()) {
  fatal(new Error('WebGL indisponível neste navegador'))
} else {
  game.boot().catch(fatal)
}

// Tela de "clique para começar": o Pointer Lock exige gesto do usuário.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && game.sm.current === 'MENU') game.menuAction('start')
})
