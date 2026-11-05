/**
 * Texturas PROCEDURAIS (canvas 2D -> THREE.CanvasTexture).
 *
 * Por quê: o repo precisa ficar pequeno para o GitHub Pages e, enquanto os
 * assets finais (.webp 1024²) não entram em public/textures, o jogo já roda
 * com look decente. Quando o artista subir as .webp reais, o AssetLoader
 * delas assume automaticamente e estes geradores viram só o fallback.
 */
import * as THREE from 'three'

const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function'

function makeCanvas(size) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return [c, c.getContext('2d')]
}

/** Ruído de grão sutil, usado sobre todas as texturas para quebrar o "CG limpo". */
function grain(ctx, size, amount = 0.06, alpha = 0.5) {
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * amount
    d[i] = Math.max(0, Math.min(255, d[i] + n))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n))
    d[i + 3] = 255 * (1 - alpha) + d[i + 3] * alpha
  }
  ctx.putImageData(img, 0, 0)
}

function stains(ctx, size, count, color) {
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  for (let i = 0; i < count; i += 1) {
    const r = size * (0.04 + Math.random() * 0.16)
    const g = ctx.createRadialGradient(Math.random() * size, Math.random() * size, r * 0.1, size * 0.5, size * 0.5, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  ctx.restore()
}

function toTexture(canvas, { repeat = 1, anisotropy = 1 } = {}) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.anisotropy = anisotropy
  tex.needsUpdate = true
  return tex
}

/** Papel de parede velho listrado (paredes internas). */
export function wallpaperTexture({ size = 512, repeat = 1, anisotropy = 1 } = {}) {
  if (!hasDom()) return null
  const [c, ctx] = makeCanvas(size)
  ctx.fillStyle = '#5c5138'
  ctx.fillRect(0, 0, size, size)
  const stripes = 10
  for (let i = 0; i < stripes; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,240,200,0.055)' : 'rgba(0,0,0,0.07)'
    ctx.fillRect((i * size) / stripes, 0, size / stripes, size)
  }
  ctx.strokeStyle = 'rgba(30,22,12,0.5)'
  ctx.lineWidth = 2
  for (let i = 1; i < stripes; i += 1) {
    const x = (i * size) / stripes
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, size)
    ctx.stroke()
  }
  // Vinil descolando: linhas verticais finas e irregulares.
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'
  for (let i = 0; i < 40; i += 1) {
    ctx.lineWidth = Math.random() * 1.4
    ctx.beginPath()
    const x = Math.random() * size
    ctx.moveTo(x, 0)
    ctx.bezierCurveTo(x + 8, size * 0.3, x - 10, size * 0.6, x + 4, size)
    ctx.stroke()
  }
  stains(ctx, size, 14, 'rgba(46,32,18,0.55)')
  grain(ctx, size, 0.1, 0.75)
  return toTexture(c, { repeat, anisotropy })
}

/** Piso de madeira em tábuas (chão). */
export function floorboardTexture({ size = 512, planks = 8, repeat = 1, anisotropy = 1 } = {}) {
  if (!hasDom()) return null
  const [c, ctx] = makeCanvas(size)
  const ph = size / planks
  for (let i = 0; i < planks; i += 1) {
    const shade = 0.62 + Math.random() * 0.28
    const r = Math.round(96 * shade)
    const g = Math.round(70 * shade)
    const b = Math.round(44 * shade)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, i * ph, size, ph)
    // veios
    ctx.strokeStyle = 'rgba(40,26,14,0.35)'
    for (let v = 0; v < 7; v += 1) {
      ctx.lineWidth = 0.6 + Math.random()
      const y = i * ph + Math.random() * ph
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(size * 0.3, y + 3, size * 0.7, y - 3, size, y + 1)
      ctx.stroke()
    }
    // emenda escura + fresta
    ctx.fillStyle = 'rgba(12,8,4,0.75)'
    ctx.fillRect(0, i * ph, size, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(Math.random() * size, i * ph, 3, ph)
  }
  stains(ctx, size, 10, 'rgba(30,20,10,0.5)')
  grain(ctx, size, 0.09, 0.8)
  return toTexture(c, { repeat, anisotropy })
}

/** Teto/parede de reboco manchado. */
export function plasterTexture({ size = 512, repeat = 1, anisotropy = 1 } = {}) {
  if (!hasDom()) return null
  const [c, ctx] = makeCanvas(size)
  ctx.fillStyle = '#6a6558'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = `rgba(${20 + Math.random() * 60},${18 + Math.random() * 55},${14 + Math.random() * 45},${
      Math.random() * 0.14
    })`
    const r = 2 + Math.random() * 26
    ctx.beginPath()
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2)
    ctx.fill()
  }
  stains(ctx, size, 18, 'rgba(58,44,26,0.6)')
  grain(ctx, size, 0.12, 0.8)
  return toTexture(c, { repeat, anisotropy })
}

/** Madeira escura de porta/móvel. */
export function woodPanelTexture({ size = 256, repeat = 1, anisotropy = 1 } = {}) {
  if (!hasDom()) return null
  const [c, ctx] = makeCanvas(size)
  ctx.fillStyle = '#3c2a1a'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = 'rgba(15,9,4,0.5)'
  for (let i = 0; i < 60; i += 1) {
    ctx.lineWidth = 0.5 + Math.random() * 1.2
    const y = Math.random() * size
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(size * 0.25, y + 5, size * 0.75, y - 5, size, y)
    ctx.stroke()
  }
  grain(ctx, size, 0.08, 0.85)
  return toTexture(c, { repeat, anisotropy })
}

/** Mapa de normal barato derivado de luminância (para dar relevo às tábuas). */
export function normalFromCanvas(source, strength = 2.2) {
  if (!hasDom() || !source) return null
  const size = source.width
  const [c, ctx] = makeCanvas(size)
  const src = source.getContext('2d').getImageData(0, 0, size, size).data
  const out = ctx.createImageData(size, size)
  const lum = (x, y) => {
    const i = ((((y + size) % size) * size + ((x + size) % size)) << 2)
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength
      const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength
      const len = Math.hypot(-dx, -dy, 1)
      const i = (y * size + x) << 2
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255
      out.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255
      out.data[i + 2] = (1 / len) * 255
      out.data[i + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

/** Material "placeholder" padronizado para qualquer objeto ainda sem arte. */
export function placeholderMaterial(color = 0x6b6b6b, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 })
}
