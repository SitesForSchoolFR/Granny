import { Game } from './core/Game.js'

/**
 * Ponto de entrada. Tudo que existe aqui é: achar os nós do DOM, instanciar o
 * Game e matê-lo com dignidade. A lógica vive em src/core/Game.js.
 */
const params = new URLSearchParams(window.location.search)

const canvas = document.getElementById('scene')
const hudRoot = document.getElementById('hud')
const screensRoot = document.getElementById('screens')

// Sinal para o vigia inline do index.html: o bundle chegou a rodar.
window.__escapeHouse = window.__escapeHouse ?? { started: false, booted: false, failed: [] }
window.__escapeHouse.started = true
// Primeira linha útil do console em depuração remota: se isto aparecer, o
// bundle carregou e o problema está no boot (não no caminho do arquivo).
console.info('[escape-house] bundle carregado em', location.href)

// O construtor do Game cria o WebGLRenderer — e um erro aqui estoura ANTES de
// existir promise, ou seja, nao cai em nenhum .catch(). Construir dentro do
// try e a diferenca entre "tela de erro legivel" e "loading infinito".
let game
try {
  game = new Game({ canvas, hudRoot, screensRoot, params })
} catch (err) {
  fatal(err)
  throw err
}
window.game = game // console: game.debugText(), game.save.snapshot(...)

function fatal(err) {
  console.error('[escape-house] boot falhou', err)
  const box = document.getElementById('loading')
  if (!box) return
  const stage = window.__escapeHouse?.stage
  box.hidden = false
  box.style.display = ''
  box.classList.add('is-error')
  box.innerHTML = `
    <div class="loading__inner">
      <p class="loading__title">A CASA NÃO ABRIU</p>
      <p class="loading__label">${escapeHtml(String(err?.message ?? err))}</p>
      ${stage ? `<p class="loading__hint">etapa: <code>${escapeHtml(stage)}</code></p>` : ''}
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

// Boot com prazo: se algo travar (promessa que nunca resolve, driver de vídeo
// pendurado), o jogo mostra o erro em vez de ficar preso no "acordando…".
const BOOT_TIMEOUT_MS = 20000

function bootWithWatchdog() {
  let timer = 0
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(
      () => reject(new Error(`o boot passou de ${BOOT_TIMEOUT_MS / 1000}s — veja o console (F12)`)),
      BOOT_TIMEOUT_MS,
    )
  })
  return Promise.race([game.boot(), timeout]).finally(() => window.clearTimeout(timer))
}

// Rede de segurança: qualquer exceção que escape (módulo, handler de evento,
// promise sem catch) vira tela de erro em vez de loading parado. Em console de
// videogame nao existe "abrir o console", entao a mensagem tem que ir para a tela.
window.addEventListener('error', (e) => {
  if (window.__escapeHouse?.booted) return
  fatal(e.error ?? new Error(e.message || 'erro desconhecido'))
})
window.addEventListener('unhandledrejection', (e) => {
  if (window.__escapeHouse?.booted) return
  fatal(e.reason ?? new Error('promise rejeitada sem tratamento'))
})

if (!hasWebGL()) {
  fatal(new Error('WebGL indisponível neste navegador'))
} else {
  bootWithWatchdog()
    .then(() => {
      window.__escapeHouse.booted = true
    })
    .catch(fatal)
}

// Tela de "clique para começar": o Pointer Lock exige gesto do usuário.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && game.sm.current === 'MENU') game.menuAction('start')
})
