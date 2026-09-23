import { describe, expect, it } from 'vitest'
import { tuesday } from '../../data/routines/tuesday'
import { buildDayView } from '../../domain/schedule'
import { toMinutes } from '../../domain/time'
import type { DayRoutine, DayState } from '../../domain/types'
import { dayReducer, emptyDay } from '../../state/dayReducer'
import { layoutDayField } from './geometry'
import { buildDayField, getTemporalDepth, getVisibleLabels, getVisualRole } from './model'

const field = (time: string, state: DayState = emptyDay('2026-09-22'), routine: DayRoutine = tuesday) => {
  const now = toMinutes(time)
  return buildDayField(buildDayView(routine, state, now), now)
}

const node = (model: ReturnType<typeof field>, id: string) => {
  const n = model.nodes.find((x) => x.id === id)
  if (!n) throw new Error(`no node ${id}`)
  return n
}

describe('Day Field — model', () => {
  it('derives the visual role of every Tuesday block from its kind', () => {
    const view = buildDayView(tuesday, emptyDay('2026-09-22'), toMinutes('10:14'))
    const role = Object.fromEntries(view.timeline.map((b) => [b.id, getVisualRole(b, tuesday.meditation?.blockId)]))
    expect(role).toMatchObject({
      'breathwork-am': 'micro',
      substack: 'micro',
      'cierre-digital': 'micro',
      'breathwork-pm': 'micro',
      merkaba: 'medium',
      escritura: 'medium',
      ingles: 'medium',
      lectura: 'medium',
      velocity: 'medium',
      'paginas-web': 'major',
      'wellness-1': 'major',
      'wellness-2': 'major',
      gimnasio: 'major',
      hermana: 'space',
      pausa: 'space',
      alimentacion: 'space',
      'comida-ducha': 'space',
      dormir: 'endpoint',
    })
    expect(role['gap-508']).toBe('space')
  })

  it('an explicit visualRole in the routine wins over the derived one', () => {
    const routine: DayRoutine = {
      ...tuesday,
      blocks: tuesday.blocks.map((b) => (b.id === 'velocity' ? { ...b, visualRole: 'major' } : b)),
    }
    expect(node(field('10:14', undefined, routine), 'velocity').role).toBe('major')
  })

  it('spaces are open space, never nodes', () => {
    const m = field('10:14')
    const ids = m.nodes.map((n) => n.id)
    for (const id of ['hermana', 'pausa', 'alimentacion', 'comida-ducha', 'gap-508']) {
      expect(ids).not.toContain(id)
      expect(m.spaces.map((s) => s.id)).toContain(id)
    }
  })

  it('a transition that is happening now is the current node', () => {
    const m = field('07:10')
    expect(m.current.id).toBe('hermana')
    expect(m.current.temporal).toBe('current')
    expect(m.spaces.map((s) => s.id)).not.toContain('hermana')
  })

  it('detects the current block and places it at the present', () => {
    const m = field('10:14')
    expect(m.current.id).toBe('paginas-web')
    expect(m.nowU).toBeCloseTo((toMinutes('10:14') - toMinutes('06:00')) / (toMinutes('22:00') - toMinutes('06:00')))
    expect(m.current.u).toBe(m.nowU)
    expect(m.nodes.filter((n) => n.temporal === 'current')).toHaveLength(1)
  })

  it('takes the day limits from the routine, not from fixed hours', () => {
    const later: DayRoutine = {
      ...tuesday,
      blocks: [
        { id: 'a', start: '09:00', end: '10:00', title: 'A', kind: 'practice', energy: 'activacion' },
        { id: 'b', start: '10:00', end: '13:00', title: 'B', kind: 'deep', energy: 'focus' },
        { id: 'z', start: '23:30', title: 'Z', kind: 'sleep', energy: 'cierre' },
      ],
      meditation: undefined,
    }
    const m = field('11:30', undefined, later)
    expect(m.dayStart).toBe(toMinutes('09:00'))
    expect(m.dayEnd).toBe(toMinutes('23:30'))
    expect(node(m, 'a').u).toBeCloseTo(30 / 870)
    expect(m.current.id).toBe('b')
  })

  it('passed time is never assumed completed: past blocks without a record stay unregistered', () => {
    const m = field('15:00')
    for (const id of ['merkaba', 'escritura', 'ingles', 'lectura', 'paginas-web', 'velocity']) {
      expect(node(m, id).temporal).toBe('past')
      expect(node(m, id).execution).toBe('unregistered')
    }
  })

  it('shows real stored states: completed, partial, skipped', () => {
    let s = emptyDay('2026-09-22')
    s = dayReducer(s, { type: 'complete', blockId: 'escritura' })
    s = dayReducer(s, { type: 'close', blockId: 'paginas-web', outcome: 'parcial', note: 'Faltan pruebas' })
    s = dayReducer(s, { type: 'skip', blockId: 'ingles' })
    const m = field('15:00', s)
    expect(node(m, 'escritura').execution).toBe('completed')
    expect(node(m, 'paginas-web').execution).toBe('partial')
    expect(node(m, 'ingles').execution).toBe('skipped')
    expect(node(m, 'lectura').execution).toBe('unregistered')
    // Temporal side and execution stay independent.
    expect(node(m, 'paginas-web').temporal).toBe('past')
  })

  it('does not modify the day state', () => {
    const s = emptyDay('2026-09-22')
    const before = JSON.stringify(s)
    field('15:00', s)
    expect(JSON.stringify(s)).toBe(before)
  })

  it('depth grows with distance from now, on both sides', () => {
    const m = field('14:10')
    const near = getTemporalDepth(node(m, 'velocity'), m.now)
    const far = getTemporalDepth(node(m, 'merkaba'), m.now)
    expect(near.side).toBe('past')
    expect(far.f).toBeGreaterThan(near.f)
    expect(getTemporalDepth(m.current, m.now).f).toBe(0)
    expect(getTemporalDepth(node(m, 'gimnasio'), m.now).side).toBe('future')
  })

  it('labels: current, at most one behind and one ahead', () => {
    const l = getVisibleLabels(field('10:14'))
    expect(l.current.id).toBe('paginas-web')
    expect(l.previous?.id).toBe('lectura')
    expect(l.next?.id).toBe('wellness-1')
    const count = [l.current, l.previous, l.next].filter(Boolean).length
    expect(count).toBeLessThanOrEqual(3)
  })

  it('before the day starts the present is last night, ahead of everything', () => {
    const m = field('04:00')
    expect(m.current.role).toBe('endpoint')
    expect(m.nowU).toBeLessThan(0)
    expect(m.nodes.filter((n) => n.temporal === 'past')).toHaveLength(0)
  })
})

describe('Day Field — layout', () => {
  const MOBILE = [390, 844] as const
  const hours = ['07:10', '10:14', '12:05', '14:10', '16:30', '19:30', '21:00']

  it.each(hours)('%s keeps the present at the anchor (mobile)', (time) => {
    const l = layoutDayField(field(time), ...MOBILE)
    expect(l.current.x / MOBILE[0]).toBeGreaterThanOrEqual(0.42)
    expect(l.current.x / MOBILE[0]).toBeLessThanOrEqual(0.48)
    expect(l.current.y / MOBILE[1]).toBeGreaterThanOrEqual(0.4)
    expect(l.current.y / MOBILE[1]).toBeLessThanOrEqual(0.47)
  })

  it.each(hours)('%s keeps time order along the trajectory', (time) => {
    const l = layoutDayField(field(time), ...MOBILE)
    for (let i = 1; i < l.nodes.length; i++) expect(l.nodes[i].sigma).toBeGreaterThan(l.nodes[i - 1].sigma)
  })

  it.each(hours)('%s keeps every mark on screen at 320 and 390', (time) => {
    for (const [w, h] of [
      [320, 640],
      [390, 844],
      [1440, 900],
    ]) {
      const l = layoutDayField(field(time), w, h)
      for (const n of l.nodes) {
        expect(n.x).toBeGreaterThan(0)
        expect(n.x).toBeLessThan(w)
        expect(n.y).toBeGreaterThan(0)
        expect(n.y).toBeLessThan(h)
      }
    }
  })

  it('morning is mostly ahead, night mostly behind', () => {
    const morning = layoutDayField(field('07:10'), ...MOBILE)
    const night = layoutDayField(field('21:00'), ...MOBILE)
    const count = (l: typeof morning, side: string) => l.nodes.filter((n) => n.node.temporal === side).length
    expect(count(morning, 'future')).toBeGreaterThan(count(morning, 'past') * 3)
    expect(count(night, 'past')).toBeGreaterThan(count(night, 'future') * 3)
  })

  it('closer in time is closer on screen', () => {
    const l = layoutDayField(field('10:14'), ...MOBILE)
    const d = (id: string) => {
      const n = l.nodes.find((x) => x.node.id === id)!
      return Math.hypot(n.x - l.current.x, n.y - l.current.y)
    }
    expect(d('velocity')).toBeLessThan(d('wellness-1'))
    expect(d('wellness-1')).toBeLessThan(d('wellness-2'))
    expect(d('lectura')).toBeLessThan(d('merkaba'))
  })

  it('deep work carries more micro-points than recovery', () => {
    const l = layoutDayField(field('10:14'), ...MOBILE)
    const count = (id: string) => l.points.filter((p) => p.id.startsWith(`${id}-p`)).length
    expect(count('wellness-1')).toBeGreaterThan(count('velocity'))
    expect(count('velocity')).toBeGreaterThan(0)
  })

  it('gravity is subtle: at most 4 px, only near the present', () => {
    const l = layoutDayField(field('14:10'), ...MOBILE)
    for (const n of l.nodes) expect(Math.hypot(n.pull.x, n.pull.y)).toBeLessThanOrEqual(4.001)
    const far = l.nodes.find((n) => n.node.id === 'merkaba')!
    expect(Math.hypot(far.pull.x, far.pull.y)).toBe(0)
  })

  it('the collapse keeps a few survivors for the AHORA module and absorbs part of the rest', () => {
    const l = layoutDayField(field('10:14'), ...MOBILE)
    const module = l.points.filter((p) => p.fate === 'module')
    const absorbed = l.points.filter((p) => p.fate === 'absorb').length / (l.points.length - module.length)
    expect(module).toHaveLength(8)
    expect(new Set(module.map((p) => `${p.cell!.x},${p.cell!.y}`)).size).toBe(8)
    expect(absorbed).toBeGreaterThanOrEqual(0.2)
    expect(absorbed).toBeLessThanOrEqual(0.3)
  })

  it('never names more than three activities', () => {
    for (const time of hours) {
      const { labels } = layoutDayField(field(time), ...MOBILE)
      expect([labels.current, labels.previous, labels.next].filter(Boolean).length).toBeLessThanOrEqual(3)
    }
  })

  it('labels do not overlap each other', () => {
    for (const time of hours) {
      const { labels, start, end } = layoutDayField(field(time), ...MOBILE)
      const boxes = [labels.current.box, labels.previous?.spot.box, labels.next?.spot.box, start?.spot.box, end?.spot.box].filter(
        (b): b is NonNullable<typeof b> => Boolean(b),
      )
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]
          const b = boxes[j]
          const overlap =
            a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height
          expect(overlap, `${time}: ${i}/${j}`).toBe(false)
        }
    }
  })
})
