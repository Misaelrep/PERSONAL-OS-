import { useEffect, useRef } from 'react'
import { appearance, step, type Gathering, type Particle } from './particles'

/**
 * The shared matter, drawn on one canvas: only the particles and the
 * dematerialization use it; forms, labels and cards stay in SVG / HTML.
 */
interface ParticleCanvasProps {
  width: number
  height: number
  particles: Particle[]
  gathering: { current?: Gathering }
  /** Field clock (ms). */
  clock: () => number
  running: boolean
}

/** A soft dot in the given CSS color, drawn once and stamped per particle. */
function makeSprite(color: string): HTMLCanvasElement {
  const size = 48
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.22, 'rgba(0,0,0,0.9)')
  g.addColorStop(0.5, 'rgba(0,0,0,0.25)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)
  return c
}

export function ParticleCanvas({ width, height, particles, gathering, clock, running }: ParticleCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !running) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const style = getComputedStyle(canvas)
    const sprite = makeSprite(style.getPropertyValue('--df-particle').trim() || '#8ea6c0')
    const solid = style.getPropertyValue('--ink-3').trim() || '#5c6778'

    let frame = 0
    let last = clock()
    const draw = () => {
      const t = clock()
      const dt = Math.min(50, Math.max(0, t - last))
      last = t
      const g = gathering.current
      step(particles, t, dt, g)
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        const { r, a, solid: s } = appearance(p, t, g)
        if (a <= 0.003 || r <= 0.05) continue
        if (s < 1) {
          ctx.globalAlpha = a * (1 - s)
          const size = r * 5.2
          ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size)
        }
        if (s > 0) {
          ctx.globalAlpha = a * s
          ctx.fillStyle = solid
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      // Whatever was left is handed over: nothing lingers on the canvas.
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [running, width, height, particles, gathering, clock])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ width, height, visibility: running ? 'visible' : 'hidden' }}
    />
  )
}
