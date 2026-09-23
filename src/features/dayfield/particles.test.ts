import { describe, expect, it } from 'vitest'
import { SHAPES, type FormId } from './forms'
import { appearance, assignFates, emitForm, releaseAt, step, type Particle } from './particles'

const seeded = () => {
  let s = 7
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const emit = (form: FormId, radius = 17) => {
  const out: Particle[] = []
  emitForm(out, { form, fragments: SHAPES[form], x: 200, y: 300, radius, start: 1000, alpha: 1, unit: 1 }, seeded())
  return out
}

describe('Dematerialization', () => {
  it('each form releases its matter in its own order', () => {
    const r = seeded()
    // Cardinal / Dissolving: from the ends. Axis: from the center outward.
    expect(releaseAt('cardinal', 0, r)).toBeLessThan(releaseAt('cardinal', 0.5, r))
    expect(releaseAt('dissolving', 1, r)).toBeLessThan(releaseAt('dissolving', 0.5, r))
    expect(releaseAt('axis', 0.1, r)).toBeLessThan(releaseAt('axis', 0.9, r))
  })

  it('orbit fragments keep travelling along their curvature', () => {
    for (const p of emit('orbit')) {
      const radial = ((p.x - 200) * p.vx + (p.y - 300) * p.vy) / Math.hypot(p.x - 200, p.y - 300)
      const speed = Math.hypot(p.vx, p.vy)
      expect(Math.abs(radial)).toBeLessThan(speed * 0.6)
    }
  })

  it('axis fragments move out along their own axis; prism laminae start larger', () => {
    expect(emit('axis').every((p) => Math.hypot(p.vx, p.vy) > 10)).toBe(true)
    expect(emit('prism').every((p) => p.grow > 1)).toBe(true)
    expect(emit('cardinal').every((p) => p.grow === 1)).toBe(true)
  })

  it('a modest amount of matter: tens of particles per form, not hundreds', () => {
    for (const form of ['cardinal', 'orbit', 'dissolving', 'axis', 'prism'] as FormId[]) {
      const n = emit(form).length
      expect(n).toBeGreaterThan(6)
      expect(n).toBeLessThanOrEqual(36)
    }
  })

  it('five forms, one matter: every particle has the same size range', () => {
    const all = (['cardinal', 'orbit', 'dissolving', 'axis', 'prism'] as FormId[]).flatMap((f) => emit(f))
    for (const p of all) {
      expect(p.r).toBeGreaterThanOrEqual(0.7)
      expect(p.r).toBeLessThanOrEqual(1.2)
    }
  })
})

describe('Gathering toward AHORA', () => {
  const anchor = { x: 175, y: 371 }
  const cells = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: anchor.x + sx * 9.6, y: anchor.y + sy * 9.6, r: 1.6, a: 0.35 })))

  it('four complete the module, about a quarter is absorbed, the rest dissolves', () => {
    const ps = [...emit('cardinal'), ...emit('orbit'), ...emit('prism')]
    ps.forEach((p) => (p.born = 0))
    assignFates(ps, anchor, cells, seeded())
    const module = ps.filter((p) => p.fate === 'module')
    const absorbed = ps.filter((p) => p.fate === 'absorb').length / (ps.length - module.length)
    expect(module).toHaveLength(4)
    expect(absorbed).toBeGreaterThanOrEqual(0.2)
    expect(absorbed).toBeLessThanOrEqual(0.3)
  })

  it('module particles settle exactly on their cells; absorbed ones vanish into the present', () => {
    const ps = emit('orbit')
    ps.forEach((p) => (p.born = 0))
    assignFates(ps, anchor, cells, seeded())
    const gathering = { start: 5000, anchor }
    for (let t = 5000; t <= 7000; t += 16) step(ps, t, 16, gathering)
    for (const p of ps.filter((q) => q.fate === 'module')) {
      expect(p.x).toBeCloseTo(p.cell!.x)
      expect(p.y).toBeCloseTo(p.cell!.y)
      expect(appearance(p, 7000, gathering).a).toBeCloseTo(0.35)
    }
    for (const p of ps.filter((q) => q.fate !== 'module')) expect(appearance(p, 7000, gathering).a).toBeCloseTo(0)
  })
})
