import { describe, expect, it } from 'vitest'
import { tuesday } from '../../data/routines/tuesday'
import { buildDayView } from '../../domain/schedule'
import { formatClock, toMinutes } from '../../domain/time'
import type { DayRoutine, DayState } from '../../domain/types'
import { dayReducer, emptyDay } from '../../state/dayReducer'
import { routineFor, routines } from '../../data/routines'
import { CONTINUE_AT, EXIT, EXIT_STAGES, NAME, NAME_S, cleanAt, continueAt, exploreMorphs, nameAt, nameOpacity, releaseAtMs } from './choreography'
import { hitTest, layoutDayscape, placeNames, selectionPoses, targetOf, type Measure } from './layout'
import { buildDayscape, getVisualRole, stateLabel } from './model'

const scape = (time: string, state: DayState = emptyDay('2026-09-22'), routine: DayRoutine = tuesday) => {
  const now = toMinutes(time)
  return buildDayscape(buildDayView(routine, state, now), now)
}
const byId = (model: ReturnType<typeof scape>, id: string) => {
  const a = model.activities.find((x) => x.id === id)
  if (!a) throw new Error(`no activity ${id}`)
  return a
}
/** Close enough to Inter Tight for layout tests. */
const measure: Measure = (text, size, spacing) => text.length * size * (0.62 + spacing)

describe('DAYSCAPE — model', () => {
  it('all 18 Tuesday activities float at once, transitions included, synthetic gaps not', () => {
    const m = scape('10:14')
    expect(m.activities.map((a) => a.id)).toEqual(tuesday.blocks.map((b) => b.id))
    expect(m.activities).toHaveLength(18)
    expect(m.current.id).toBe('paginas-web')
  })

  it('derives the visual role of every block from its kind; explicit roles win', () => {
    const view = buildDayView(tuesday, emptyDay('2026-09-22'), toMinutes('10:14'))
    const role = Object.fromEntries(view.timeline.map((b) => [b.id, getVisualRole(b, tuesday.meditation?.blockId)]))
    expect(role).toMatchObject({ merkaba: 'medium', 'breathwork-am': 'micro', hermana: 'space', 'paginas-web': 'major', dormir: 'endpoint' })
    const routine: DayRoutine = { ...tuesday, blocks: tuesday.blocks.map((b) => (b.id === 'velocity' ? { ...b, visualRole: 'major' } : b)) }
    expect(byId(scape('10:14', undefined, routine), 'velocity').role).toBe('major')
  })

  it('time is depth: planes by distance, the past going back sooner than the future', () => {
    const m = scape('10:14')
    expect(byId(m, 'lectura').plane).toBe('fg')
    expect(byId(m, 'velocity').plane).toBe('fg')
    expect(byId(m, 'escritura').plane).toBe('mid')
    expect(byId(m, 'wellness-1').plane).toBe('mid')
    expect(byId(m, 'merkaba').plane).toBe('bg')
    expect(byId(m, 'dormir').plane).toBe('bg')
    expect(byId(m, 'ingles').z).toBeGreaterThan(byId(m, 'lectura').z)
  })

  it('field labels are short and never two alike', () => {
    const m = scape('10:14')
    expect(byId(m, 'hermana').label).toBe('Llevar hermana')
    expect(byId(m, 'breathwork-am').label).toBe('Breathwork')
    expect(byId(m, 'breathwork-pm').label).toBe('Breathwork relajante')
    expect(byId(m, 'wellness-1').label).toBe('Marca Wellness')
    expect(byId(m, 'wellness-1').title).toBe('Nueva marca de bienestar')
  })

  it('passed time is never assumed completed; real records show, independent of time', () => {
    expect(stateLabel(byId(scape('10:14'), 'ingles'))).toBe('Sin registrar')
    expect(stateLabel(byId(scape('10:14'), 'wellness-1'))).toBe('Próximo')
    let s = emptyDay('2026-09-22')
    s = dayReducer(s, { type: 'complete', blockId: 'escritura' })
    s = dayReducer(s, { type: 'close', blockId: 'paginas-web', outcome: 'parcial', note: 'Faltan pruebas' })
    s = dayReducer(s, { type: 'skip', blockId: 'ingles' })
    const before = JSON.stringify(s)
    const m = scape('15:00', s)
    expect(stateLabel(byId(m, 'escritura'))).toBe('Completado')
    expect(stateLabel(byId(m, 'paginas-web'))).toBe('Parcial')
    expect(stateLabel(byId(m, 'ingles'))).toBe('Omitido')
    expect(byId(m, 'paginas-web').side).toBe('past')
    expect(JSON.stringify(s)).toBe(before)
  })

  it('the five configurations coexist; the present is the Prism', () => {
    const m = scape('10:14')
    expect(m.current.form).toBe('prism')
    const near = m.activities.filter((a) => a.side !== 'current').sort((p, q) => p.delta - q.delta)
    expect(new Set(m.activities.map((a) => a.form)).size).toBe(5)
    expect(near.length).toBeGreaterThan(5)
  })

  it('before the day starts the present is last night, ahead of everything', () => {
    const m = scape('05:10')
    expect(m.current.side).toBe('current')
    expect(m.activities.filter((a) => a.side === 'past')).toHaveLength(0)
  })
})

describe('DAYSCAPE — progressive reveal', () => {
  const m = scape('10:14')
  const waveOf = (id: string) => byId(m, id).wave

  it('the day forms in six waves, morning first', () => {
    expect([waveOf('merkaba'), waveOf('hermana')]).toEqual([0, 0])
    expect(['escritura', 'breathwork-am', 'substack'].map(waveOf)).toEqual([1, 1, 1])
    expect(['ingles', 'pausa', 'lectura'].map(waveOf)).toEqual([2, 2, 2])
    expect(['paginas-web', 'velocity', 'alimentacion'].map(waveOf)).toEqual([3, 3, 3])
    expect(['wellness-1', 'gimnasio', 'comida-ducha'].map(waveOf)).toEqual([4, 4, 4])
    expect(['wellness-2', 'cierre-digital', 'breathwork-pm', 'dormir'].map(waveOf)).toEqual([5, 5, 5, 5])
  })

  it('each wave stays inside its window and never forms in lockstep', () => {
    const windows = [[0, 2], [2, 3.5], [3.5, 5], [5, 7], [7, 9], [9, 11]]
    for (const a of m.activities) {
      const [s0, s1] = windows[a.wave]
      expect(a.revealAt).toBeGreaterThanOrEqual(s0)
      expect(a.revealAt).toBeLessThan(s1)
    }
    expect(new Set(m.activities.map((a) => a.revealAt.toFixed(3))).size).toBe(18)
  })

  it('each name is readable about 1.5–2 s, then dissolves in place', () => {
    const lectura = byId(m, 'lectura')
    const readable = (a: typeof lectura) => {
      let s = 0
      for (let t = 0; t < 20; t += 0.01) if (nameOpacity(a, t) >= 0.5) s += 0.01
      return s
    }
    expect(readable(lectura)).toBeGreaterThan(1.5)
    expect(readable(lectura)).toBeLessThan(2.3)
    expect(nameOpacity(lectura, nameAt(lectura) + NAME_S + 0.01)).toBe(0)
    expect(nameAt(lectura)).toBeCloseTo(lectura.revealAt + NAME.after)
  })

  it('never all 18 names at once: waves overlap, the first go while the last arrive', () => {
    let most = 0
    for (let t = 0; t < 16; t += 0.05) most = Math.max(most, m.activities.filter((a) => nameOpacity(a, t) >= 0.5).length)
    expect(most).toBeLessThanOrEqual(7)
    const first = byId(m, 'merkaba')
    const last = byId(m, 'dormir')
    expect(nameOpacity(first, nameAt(last))).toBe(0)
    const secondWave = byId(m, 'escritura')
    const fourthWave = byId(m, 'paginas-web')
    expect(nameAt(secondWave) + NAME_S).toBeGreaterThan(fourthWave.revealAt - 1.6)
  })

  it('AHORA never takes a temporary name; the field is clean before CONTINUAR appears', () => {
    expect(nameOpacity(m.current, 6)).toBe(0)
    expect(cleanAt(m.activities)).toBeGreaterThan(11)
    expect(cleanAt(m.activities)).toBeLessThan(CONTINUE_AT)
  })

  it('exploring, one slow morph at a time', () => {
    const plan = exploreMorphs(120)
    expect(plan.length).toBeGreaterThan(15)
    for (let i = 1; i < plan.length; i++) expect(plan[i].at).toBeGreaterThanOrEqual(plan[i - 1].at + plan[i - 1].duration)
  })

  it('leaving: far first, then middle, then near; the present last', () => {
    const at = (id: string) => releaseAtMs(byId(m, id))
    expect(at('merkaba')).toBeLessThan(at('escritura') + 300)
    expect(Math.max(...m.activities.filter((a) => a.plane === 'bg').map(releaseAtMs))).toBeLessThan(EXIT.release.fg + EXIT.jitter)
    expect(at('paginas-web')).toBe(EXIT.nowBreak)
    expect(Math.max(...m.activities.filter((a) => a.side !== 'current').map(releaseAtMs))).toBeLessThan(EXIT.nowBreak)
    expect(EXIT.gather - EXIT.calm).toBeGreaterThanOrEqual(2000)
    expect(EXIT.gather - EXIT.calm).toBeLessThanOrEqual(3200)
  })

  it('the way to HOY reads as progress: compact, every step a distinct advance', () => {
    const steps = [EXIT.calm, EXIT.release.fg, EXIT.nowBreak, EXIT.gather, EXIT.module[0], EXIT.named, EXIT.handoff, EXIT.done]
    for (let i = 1; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBeGreaterThanOrEqual(100)
    expect(EXIT.done).toBeLessThanOrEqual(5500)
    // Diffuse → recognizable → structured → named, before HOY takes over.
    expect(EXIT.named).toBeGreaterThan(EXIT.module[0])
    expect(EXIT.module[1]).toBeLessThanOrEqual(EXIT.handoff)
    const { settle, dematerialize, gather, handoff } = EXIT_STAGES
    expect(settle + dematerialize + gather + handoff).toBe(EXIT.done)
  })
})

describe('DAYSCAPE — composition', () => {
  const m = scape('10:14')
  const phone = layoutDayscape(m, 390, 844)

  it('AHORA is the perceptual center: the largest, sharpest, fully present', () => {
    const now = phone.items.find((p) => p.a.side === 'current')!
    expect(now.x).toBeCloseTo(206)
    expect(now.y).toBeCloseTo(486)
    for (const p of phone.items) {
      if (p === now) continue
      expect(p.R).toBeLessThan(now.R)
      expect(p.opacity).toBeLessThan(1)
    }
    expect(now.blur).toBe(0)
  })

  it('the rest of the day stays in the atmosphere: present, never competing with AHORA', () => {
    for (const p of phone.items) {
      if (p.a.side === 'current') continue
      expect(p.opacity).toBeLessThanOrEqual(0.84)
      if (p.a.plane !== 'fg') expect(p.blur).toBeGreaterThanOrEqual(0.75)
    }
    const poses = selectionPoses(phone, 'ingles')
    expect(poses.get('paginas-web')!.opacity).toBeGreaterThanOrEqual(0.7)
  })

  it('three planes: far is smaller, softer and higher', () => {
    const mean = (plane: string, k: 'R' | 'blur' | 'y') => {
      const xs = phone.items.filter((p) => p.a.plane === plane && p.a.side !== 'current').map((p) => p[k])
      return xs.reduce((s, x) => s + x, 0) / xs.length
    }
    expect(mean('bg', 'R')).toBeLessThan(mean('mid', 'R'))
    expect(mean('mid', 'R')).toBeLessThan(mean('fg', 'R'))
    expect(mean('bg', 'blur')).toBeGreaterThan(mean('mid', 'blur'))
    expect(mean('bg', 'y')).toBeLessThan(mean('fg', 'y'))
  })

  it('no two forms overlap and everything stays on screen, from 320 to 1440 px', () => {
    for (const [w, h] of [[320, 568], [375, 667], [390, 844], [768, 1024], [1440, 900]]) {
      const l = layoutDayscape(m, w, h)
      for (const p of l.items) {
        expect(p.x - p.R).toBeGreaterThan(0)
        expect(p.x + p.R).toBeLessThan(w)
        expect(p.y - p.R).toBeGreaterThan(0)
        expect(p.y + p.R).toBeLessThan(h)
        for (const q of l.items) if (p !== q) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan((p.R + q.R) * 0.9)
      }
    }
  })

  it('delicate symbols, generous invisible targets: 44–52 px', () => {
    for (const p of phone.items) {
      expect(p.hit * 2).toBeGreaterThanOrEqual(44)
      expect(p.hit * 2).toBeLessThanOrEqual(52)
    }
    expect(phone.items.filter((p) => p.R * 2 < 30).length).toBeGreaterThan(8)
  })

  it('a tap goes to the nearest activity whose target contains it, or to none', () => {
    const items = phone.items.map((p) => ({ id: p.a.id, x: p.x, y: p.y, hit: p.hit }))
    const ingles = phone.items.find((p) => p.a.id === 'ingles')!
    expect(hitTest(items, ingles.x + 14, ingles.y - 12)).toBe('ingles')
    expect(hitTest(items, 200, 790)).toBeNull()
  })

  it('every temporary name sits next to its own form, never over another name', () => {
    const l = layoutDayscape(m, 390, 844)
    placeNames(l, measure, formatClock)
    const boxes = l.items.filter((p) => p.name).map((p) => ({ x: p.x + p.name!.dx, y: p.y + p.name!.dy, w: p.name!.w, h: p.name!.h, p }))
    expect(boxes).toHaveLength(17)
    for (const b of boxes) {
      const near = Math.hypot(Math.max(b.x - b.p.x, 0, b.p.x - (b.x + b.w)), Math.max(b.y - b.p.y, 0, b.p.y - (b.y + b.h)))
      expect(near).toBeLessThan(b.p.R + 40)
      for (const c of boxes) {
        if (b === c) continue
        const ox = Math.min(b.x + b.w, c.x + c.w) - Math.max(b.x, c.x)
        const oy = Math.min(b.y + b.h, c.y + c.h) - Math.max(b.y, c.y)
        expect(ox > 0 && oy > 0).toBe(false)
      }
    }
  })

  it('inspection: the activity comes forward, the rest steps back; neighbours in time stay more present', () => {
    const poses = selectionPoses(phone, 'ingles')
    const ingles = phone.items.find((p) => p.a.id === 'ingles')!
    const target = targetOf(phone, ingles)
    const own = poses.get('ingles')!
    expect(ingles.x + own.dx).toBeCloseTo(target.x)
    expect(own.grow).toBeGreaterThan(1.5)
    expect(own.opacity).toBe(1)
    expect(own.blur).toBe(0)
    const pausa = poses.get('pausa')!
    const velocity = poses.get('velocity')!
    expect(pausa.opacity / phone.items.find((p) => p.a.id === 'pausa')!.opacity).toBeGreaterThan(
      velocity.opacity / phone.items.find((p) => p.a.id === 'velocity')!.opacity,
    )
    const now = poses.get('paginas-web')!
    expect(now.opacity).toBeGreaterThan(0.5)
  })
})

describe('DAYSCAPE — any day', () => {
  const block = (id: string, start: string, end: string | undefined, kind: DayRoutine['blocks'][number]['kind'] = 'practice') => ({
    id,
    start,
    end,
    title: `Actividad ${id}`,
    kind,
    energy: 'focus' as const,
  })
  const day = (blocks: DayRoutine['blocks'], time: string) => {
    const routine: DayRoutine = { weekday: 3, dayName: 'Miércoles', theme: '', blocks }
    const now = toMinutes(time)
    return buildDayscape(buildDayView(routine, emptyDay('2026-09-23'), now), now)
  }
  const sane = (m: ReturnType<typeof day>, w: number, h: number) => {
    const l = layoutDayscape(m, w, h)
    placeNames(l, measure, formatClock)
    for (const p of l.items) {
      for (const v of [p.x, p.y, p.R, p.opacity, p.blur]) expect(Number.isFinite(v)).toBe(true)
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(w)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(h)
      if (p.name) {
        expect(p.x + p.name.dx).toBeGreaterThanOrEqual(0)
        expect(p.x + p.name.dx + p.name.w).toBeLessThanOrEqual(w)
      }
    }
    expect(Number.isFinite(cleanAt(m.activities))).toBe(true)
    expect(continueAt(m.activities)).toBeGreaterThan(cleanAt(m.activities))
    return l
  }

  it('a registered day without blocks falls back to a routine instead of breaking', () => {
    const wednesday = new Date(2026, 8, 23, 10, 14)
    routines[3] = { ...tuesday, weekday: 3, blocks: [] }
    try {
      const { routine, isFallback } = routineFor(wednesday)
      expect(isFallback).toBe(true)
      expect(routine.blocks.length).toBeGreaterThan(0)
    } finally {
      delete routines[3]
    }
  })

  it('a single activity: AHORA alone, formed quickly, CONTINUAR soon after', () => {
    const m = day([block('a', '10:00', '12:00', 'deep')], '10:14')
    expect(m.activities).toHaveLength(1)
    expect(m.current.id).toBe('a')
    expect(m.current.revealAt).toBeLessThan(3)
    expect(continueAt(m.activities)).toBeLessThan(6)
    sane(m, 390, 844)
  })

  it('nothing happening now (before the day): the night is the present', () => {
    const m = day([block('a', '09:00', '10:00'), block('b', '11:00', '12:00'), block('z', '22:00', undefined, 'sleep')], '06:30')
    expect(m.current.side).toBe('current')
    expect(m.activities.filter((a) => a.side === 'past')).toHaveLength(0)
    sane(m, 390, 844)
  })

  it('only sleep in the routine', () => {
    sane(day([block('z', '22:00', undefined, 'sleep')], '10:14'), 390, 844)
  })

  it('a crowded day (30 activities) keeps every form and name on screen, phone to desktop', () => {
    const blocks = Array.from({ length: 30 }, (_, i) => {
      const s = 6 * 60 + i * 30
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      return block(`b${i}`, hhmm(s), hhmm(s + 25), i % 4 === 0 ? 'deep' : 'practice')
    })
    const m = day(blocks, '12:40')
    expect(m.activities.length).toBeGreaterThanOrEqual(30)
    expect(cleanAt(m.activities)).toBeGreaterThan(cleanAt(scape('10:14').activities))
    for (const [w, h] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) sane(m, w, h)
  })

  it('a transition happening now is AHORA too', () => {
    const m = scape('09:20')
    expect(m.current.id).toBe('pausa')
    sane(m, 390, 844)
  })
})
