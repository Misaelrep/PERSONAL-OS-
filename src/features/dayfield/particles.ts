import { burst, lengthOf, pointAt, type FormId, type Fragment, type P } from './forms'
import type { Pt } from './geometry'

/**
 * ONE MATTER. Whatever form a node had, it ends as the same particles: same
 * size, same light. Only how they are released differs. Pure bookkeeping
 * (emission, motion, gathering); drawing lives in the canvas component.
 *
 * Times are field milliseconds.
 */
export type Fate = 'fade' | 'absorb' | 'module'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  a: number
  born: number
  /** Size at birth relative to its final size (prism laminae start larger and softer). */
  grow: number
  seed: number
  fate: Fate
  /** Where a module particle settles. */
  cell?: Pt & { r: number; a: number }
  sx: number
  sy: number
  delay: number
  dur: number
}

/** How long each form takes to come apart (matches the SVG breakup). */
export const ERODE_MS: Record<FormId, number> = {
  cardinal: 800,
  orbit: 950,
  dissolving: 650,
  axis: 850,
  prism: 1000,
}

/** Ease-out used for the breakup spread, shared with the drawing. */
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/**
 * When (0–1 of its breakup) the point at `s` along a fragment becomes matter.
 * Cardinal and Dissolving erode from the ends, Axis from the center outward,
 * Orbit and Prism release along the whole piece.
 */
export function releaseAt(form: FormId, s: number, rand: () => number): number {
  switch (form) {
    case 'cardinal':
    case 'dissolving':
      return 2 * Math.min(s, 1 - s)
    case 'axis':
      return s
    case 'orbit':
      return 0.3 + rand() * 0.55
    case 'prism':
      return 0.35 + rand() * 0.6
  }
}

function tangent(f: Fragment, t: number): P {
  const u = 1 - t
  const [a, b, c, d] = f.p
  const x = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0])
  const y = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1])
  const len = Math.hypot(x, y) || 1
  return [x / len, y / len]
}

const unitOf = (x: number, y: number): P => {
  const len = Math.hypot(x, y) || 1
  return [x / len, y / len]
}

function particle(x: number, y: number, vx: number, vy: number, r: number, a: number, born: number, rand: () => number, grow = 1): Particle {
  return { x, y, vx, vy, r, a, born, grow, seed: rand() * 1000, fate: 'fade', sx: x, sy: y, delay: 0, dur: 1000 }
}

export interface FormEmission {
  form: FormId
  fragments: Fragment[]
  /** Center and radius of the form on screen (px). */
  x: number
  y: number
  radius: number
  /** Field ms when this form starts coming apart. */
  start: number
  alpha: number
  unit: number
}

/** Turn a form into matter, in its own way. */
export function emitForm(out: Particle[], e: FormEmission, rand: () => number): void {
  const duration = ERODE_MS[e.form]
  for (const f of e.fragments) {
    if (f.stroke < 0.05 && f.fill < 0.03) continue
    const n = Math.min(6, Math.max(1, Math.round((lengthOf(f) * e.radius) / (4.2 * e.unit))))
    for (let j = 0; j < n; j++) {
      const s = Math.min(1, Math.max(0, (j + 0.5 + (rand() - 0.5) * 0.5) / n))
      const release = releaseAt(e.form, s, rand)
      const moved = burst(f, e.form, easeOut(release))
      const q = pointAt(moved, s)
      const out0 = unitOf(q[0], q[1])
      let v: P
      let grow = 1
      switch (e.form) {
        case 'cardinal': {
          const k = 16 + rand() * 12
          v = [out0[0] * k, out0[1] * k]
          break
        }
        case 'orbit': {
          // Keeps travelling along the orbit before losing cohesion.
          const t = tangent(moved, s)
          const k = 28 + rand() * 16
          v = [t[0] * k + out0[0] * 5, t[1] * k + out0[1] * 5]
          break
        }
        case 'dissolving': {
          const a = rand() * Math.PI * 2
          const k = 5 + rand() * 9
          v = [Math.cos(a) * k + out0[0] * 4, Math.sin(a) * k + out0[1] * 4]
          break
        }
        case 'axis': {
          const d = unitOf(f.p[3][0] - f.p[0][0], f.p[3][1] - f.p[0][1])
          const k = 14 + rand() * 12
          v = [d[0] * k, d[1] * k]
          break
        }
        case 'prism': {
          const k = 7 + rand() * 6
          v = [out0[0] * k, out0[1] * k]
          grow = 2.4
          break
        }
      }
      out.push(
        particle(
          e.x + q[0] * e.radius,
          e.y + q[1] * e.radius,
          v[0] * e.unit,
          v[1] * e.unit,
          (0.7 + rand() * 0.5) * e.unit,
          e.alpha * (0.55 + rand() * 0.35),
          e.start + release * duration,
          rand,
          grow,
        ),
      )
    }
  }
}

/** Loose points (micro-points) become the same matter where they are. */
export function emitPoints(out: Particle[], points: (Pt & { r: number; o: number; start: number })[], rand: () => number): void {
  for (const p of points) {
    const a = rand() * Math.PI * 2
    const k = 3 + rand() * 6
    out.push(particle(p.x, p.y, Math.cos(a) * k, Math.sin(a) * k, p.r, p.o, p.start + rand() * 250, rand))
  }
}

/** A trajectory fragment erodes from its ends into matter. */
export function emitTrail(out: Particle[], samples: Pt[], start: number, duration: number, alpha: number, unit: number, rand: () => number): void {
  samples.forEach((p, i) => {
    const s = samples.length === 1 ? 0.5 : i / (samples.length - 1)
    const a = rand() * Math.PI * 2
    const k = 3 + rand() * 5
    out.push(particle(p.x, p.y, Math.cos(a) * k, Math.sin(a) * k, (0.6 + rand() * 0.4) * unit, alpha, start + 2 * Math.min(s, 1 - s) * duration, rand))
  })
}

/**
 * Gathering toward AHORA: the nearest particles complete the AHORA module,
 * about a quarter of the rest is absorbed by the present, the rest dissolves.
 */
export function assignFates(particles: Particle[], anchor: Pt, cells: (Pt & { r: number; a: number })[], rand: () => number): void {
  const d = (p: Particle) => Math.hypot(p.x - anchor.x, p.y - anchor.y)
  const sorted = [...particles].sort((p, q) => d(p) - d(q))
  const survivors = sorted.slice(0, cells.length)
  const angle = (p: Pt) => Math.atan2(p.y - anchor.y, p.x - anchor.x)
  const ordered = [...cells].sort((a, b) => angle(a) - angle(b))
  ;[...survivors]
    .sort((a, b) => angle(a) - angle(b))
    .forEach((p, i) => {
      p.fate = 'module'
      p.cell = ordered[i]
      p.delay = 120
      p.dur = 1100
    })
  const rest = sorted.slice(cells.length)
  const absorbed = Math.round(rest.length * 0.25)
  rest.forEach((p, i) => {
    p.sx = p.x
    p.sy = p.y
    if (i < absorbed) {
      p.fate = 'absorb'
      p.delay = rand() * 300
      p.dur = 850 + rand() * 350
    } else {
      p.fate = 'fade'
      p.delay = rand() * 400
      p.dur = 600 + rand() * 450
    }
  })
  for (const p of survivors) {
    p.sx = p.x
    p.sy = p.y
  }
}

export interface Gathering {
  start: number
  anchor: Pt
}

/** Advance the matter to field time `t` (dt in ms). */
export function step(particles: Particle[], t: number, dt: number, gathering?: Gathering): void {
  const damp = Math.exp((-dt / 1000) * 1.6)
  for (const p of particles) {
    if (t < p.born) continue
    const g = gathering && t >= gathering.start ? clamp01((t - gathering.start - p.delay) / p.dur) : -1
    if (g >= 0 && p.fate !== 'fade') {
      const e = easeInOut(g)
      const target = p.fate === 'module' && p.cell ? p.cell : gathering!.anchor
      p.x = p.sx + (target.x - p.sx) * e
      p.y = p.sy + (target.y - p.sy) * e
      continue
    }
    p.vx *= damp
    p.vy *= damp
    // A slow, individual drift keeps the field of matter alive.
    const drift = 0.0035 * dt
    p.x += (p.vx * dt) / 1000 + Math.sin(t * 0.0009 + p.seed) * drift
    p.y += (p.vy * dt) / 1000 + Math.cos(t * 0.0008 + p.seed * 1.3) * drift
  }
}

/** Visible radius and alpha at field time `t`; module particles also report how solid they are. */
export function appearance(p: Particle, t: number, gathering?: Gathering): { r: number; a: number; solid: number } {
  if (t < p.born) return { r: 0, a: 0, solid: 0 }
  const age = t - p.born
  const r = p.r * (1 + (p.grow - 1) * Math.exp(-age / 380))
  const a = p.a * Math.min(1, age / 180)
  if (!gathering || t < gathering.start) return { r, a, solid: 0 }
  const e = easeInOut(clamp01((t - gathering.start - p.delay) / p.dur))
  if (p.fate === 'module' && p.cell) return { r: r + (p.cell.r - r) * e, a: a + (p.cell.a - a) * e, solid: clamp01((e - 0.55) / 0.45) }
  if (p.fate === 'absorb') return { r: r * (1 - 0.6 * e), a: a * (1 - e * e * e), solid: 0 }
  return { r: r * (1 + 0.6 * e), a: a * (1 - e), solid: 0 }
}
