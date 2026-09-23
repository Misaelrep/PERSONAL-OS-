import {
  getTemporalDepth,
  getVisibleLabels,
  type DayFieldModel,
  type FieldNode,
  type TemporalDepth,
  type TemporalSide,
} from './model'

/**
 * DAY FIELD geometry — where every element of the field sits on screen.
 *
 * The day lies on an organic, open trajectory. The present is pinned to a fixed
 * anchor and the day is laid out around it: distance along the trajectory is
 * distance in time, gently compressed far from now (depth). Pure and
 * deterministic, so it can be tested without a browser.
 */
export interface Pt {
  x: number
  y: number
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface PlacedNode {
  node: FieldNode
  x: number
  y: number
  /** Arc position on screen, px from the present (negative = behind). */
  sigma: number
  depth: TemporalDepth
  /** Radius of its form (px) before depth. */
  r: number
  /** Gravity: small offset toward the present (px). */
  pull: Pt
  /** Radius of the tap target (px): generous, but never over a neighbour. */
  hit: number
}

export interface Fragment {
  id: string
  d: string
  side: Exclude<TemporalSide, 'current'>
  /** 0 near the present → 1 far. */
  f: number
  major: boolean
  /** Belongs to the current block. */
  current: boolean
  /** Points along it, in order, for its dematerialization. */
  samples: Pt[]
}

export interface MicroPoint {
  id: string
  x: number
  y: number
  r: number
  o: number
  side: TemporalSide
  f: number
  pull: Pt
}

export interface SpaceGlow {
  id: string
  x: number
  y: number
  r: number
  side: Exclude<TemporalSide, 'current'>
}

export type HAlign = 'left' | 'right' | 'center'
export type VAlign = 'top' | 'middle' | 'bottom'

export interface LabelSpot {
  /** Attach point; the box extends away from it according to the alignment. */
  x: number
  y: number
  h: HAlign
  v: VAlign
  box: Box
}

export interface TimeAnchor {
  text: string
  point: Pt
  spot: LabelSpot
}

export interface DayFieldLayout {
  width: number
  height: number
  portrait: boolean
  /** Size multiplier for marks (desktop draws slightly larger). */
  unit: number
  anchor: Pt
  nodes: PlacedNode[]
  current: PlacedNode
  fragments: Fragment[]
  points: MicroPoint[]
  glows: SpaceGlow[]
  start?: TimeAnchor
  end?: TimeAnchor
  labels: {
    current: LabelSpot
    previous?: { node: PlacedNode; spot: LabelSpot }
    next?: { node: PlacedNode; spot: LabelSpot }
  }
  /** The AHORA module (3 × 3) the collapse leaves behind. */
  module: { pitch: number; scale: number }
  /** Pixels of trajectory per unit of (compressed) day. */
  k: number
}

const TAU = Math.PI * 2
const DEG = Math.PI / 180

/** Far from now, time compresses a little: depth instead of a ruler. */
const COMPRESSION = 0.8
function compress(du: number): number {
  return du / (1 + Math.abs(du) / COMPRESSION)
}

/** Radius of each role's form (px at unit 1). */
const RADIUS = { micro: 5, medium: 9, major: 12.5, endpoint: 8, space: 8 } as const
/** The present's form is the largest in the field. */
export const CURRENT_RADIUS = 20

/** Micro-points per block at full concentration. */
const MAX_POINTS = 7

/** Where gravity reaches, in minutes from now. */
const GRAVITY_MIN = 150
const GRAVITY_PX = 4

/** Scale of the AHORA module relative to the 18 px matrix in HOY. */
const MODULE_SCALE = { portrait: 1.6, landscape: 1.8 }

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function random(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Frame {
  width: number
  height: number
  portrait: boolean
  unit: number
  /** Safe rectangle the day should stay inside. */
  safe: { left: number; top: number; right: number; bottom: number }
  anchor: Pt
  theta: number
  amplitude: number
  wavelength: number
  kMin: number
  kMax: number
}

function frameFor(width: number, height: number): Frame {
  const portrait = width / height < 0.9
  const diag = Math.hypot(width, height)
  const padX = portrait ? 22 : Math.max(48, width * 0.05)
  const safe = portrait
    ? { left: padX, top: 76, right: width - padX, bottom: height - 84 }
    : { left: padX, top: 72, right: width - padX, bottom: height - 72 }
  // Mobile: upper-left → center → lower-right. Desktop: a flatter, wider drift.
  // The sway is wide but never turns back, so the trajectory can't loop.
  const diagonal = Math.atan2(safe.bottom - safe.top, safe.right - safe.left)
  const theta = portrait
    ? Math.min(Math.max(diagonal * 0.78, 40 * DEG), 54 * DEG)
    : Math.min(Math.max(diagonal * 0.3, 6 * DEG), 12 * DEG)
  return {
    width,
    height,
    portrait,
    unit: portrait ? 1 : 1.3,
    safe,
    anchor: portrait ? { x: width * 0.45, y: height * 0.44 } : { x: width * 0.46, y: height * 0.48 },
    theta,
    amplitude: (portrait ? 36 : 22) * DEG,
    wavelength: portrait ? diag * 1.02 : width * 0.95,
    kMin: portrait ? diag * 0.5 : width * 0.5,
    kMax: portrait ? diag * 1.6 : width * 1.4,
  }
}

interface Curve {
  at(sigma: number): Pt & { angle: number }
}

/**
 * The trajectory, parameterized by arc length from the present. Its direction
 * sways around the frame's main direction, steepest near the present, so the
 * day draws an open S through it: arriving from one corner, leaving toward the
 * opposite one.
 */
function buildCurve(frame: Frame, phase: number): Curve {
  const step = 2
  const extent = frame.kMax + 400
  const n = Math.ceil(extent / step)
  const angle = (s: number) => frame.theta + frame.amplitude * Math.cos((TAU * s) / frame.wavelength + phase)
  const fwd: number[] = [frame.anchor.x, frame.anchor.y]
  const back: number[] = [frame.anchor.x, frame.anchor.y]
  for (let i = 0; i < n; i++) {
    const a = angle((i + 0.5) * step)
    fwd.push(fwd[i * 2] + step * Math.cos(a), fwd[i * 2 + 1] + step * Math.sin(a))
    const b = angle(-(i + 0.5) * step)
    back.push(back[i * 2] - step * Math.cos(b), back[i * 2 + 1] - step * Math.sin(b))
  }
  return {
    at(sigma) {
      const list = sigma >= 0 ? fwd : back
      const t = Math.min(Math.abs(sigma) / step, n)
      const i = Math.min(Math.floor(t), n - 1)
      const w = t - i
      const extra = Math.max(0, Math.abs(sigma) - n * step) * Math.sign(sigma)
      const a = angle(sigma)
      return {
        x: list[i * 2] + (list[i * 2 + 2] - list[i * 2]) * w + extra * Math.cos(a),
        y: list[i * 2 + 1] + (list[i * 2 + 3] - list[i * 2 + 1]) * w + extra * Math.sin(a),
        angle: a,
      }
    },
  }
}

function radiusOf(node: FieldNode): number {
  return RADIUS[node.role]
}

/**
 * Arc positions for a given scale K: time → compressed distance, then nudged so
 * neighbouring marks never touch. Everything else follows through `warp`.
 */
function arrange(model: DayFieldModel, k: number, unit: number) {
  const { nodes, nowU } = model
  const raw = nodes.map((n) => k * compress(n.u - nowU))
  const sig = [...raw]
  const c = nodes.indexOf(model.current)
  const room = (n: FieldNode) => (n === model.current ? CURRENT_RADIUS * 0.75 : radiusOf(n) * 0.62) * unit
  const gap = (a: FieldNode, b: FieldNode) => room(a) + room(b) + 9 * unit
  for (let i = c + 1; i < nodes.length; i++) sig[i] = Math.max(sig[i], sig[i - 1] + gap(nodes[i - 1], nodes[i]))
  for (let i = c - 1; i >= 0; i--) sig[i] = Math.min(sig[i], sig[i + 1] - gap(nodes[i], nodes[i + 1]))

  /** Monotone map from raw arc position to the nudged one. */
  const warp = (s: number) => {
    if (s <= raw[0]) return s + (sig[0] - raw[0])
    const last = raw.length - 1
    if (s >= raw[last]) return s + (sig[last] - raw[last])
    let i = 0
    while (raw[i + 1] < s) i++
    const span = raw[i + 1] - raw[i]
    const t = span > 0 ? (s - raw[i]) / span : 0
    return sig[i] + (sig[i + 1] - sig[i]) * t
  }
  const at = (u: number) => warp(k * compress(u - nowU))
  return { sig, at }
}

function inside(p: Pt, safe: Frame['safe']): boolean {
  return p.x >= safe.left && p.x <= safe.right && p.y >= safe.top && p.y <= safe.bottom
}

/** Largest scale (up to the frame's maximum) that keeps the whole day on screen. */
function fitScale(model: DayFieldModel, frame: Frame, curve: Curve): number {
  const fits = (k: number) => {
    const { sig, at } = arrange(model, k, frame.unit)
    if (!sig.every((s) => inside(curve.at(s), frame.safe))) return false
    return inside(curve.at(at(0)), frame.safe) && inside(curve.at(at(1)), frame.safe)
  }
  if (fits(frame.kMax)) return frame.kMax
  if (!fits(frame.kMin)) return frame.kMin
  let lo = frame.kMin
  let hi = frame.kMax
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}

function sideOf(u: number, nowU: number): Exclude<TemporalSide, 'current'> {
  return u < nowU ? 'past' : 'future'
}

function samplesBetween(curve: Curve, a: number, b: number, every: number): Pt[] {
  const n = Math.max(1, Math.round(Math.abs(b - a) / every))
  return Array.from({ length: n }, (_, i) => {
    const p = curve.at(a + ((b - a) * (i + 0.5)) / n)
    return { x: p.x, y: p.y }
  })
}

function pathBetween(curve: Curve, a: number, b: number): string {
  const steps = Math.max(2, Math.ceil(Math.abs(b - a) / 4))
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const p = curve.at(a + ((b - a) * i) / steps)
    d += `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  }
  return d
}

function normal(angle: number): Pt {
  return { x: -Math.sin(angle), y: Math.cos(angle) }
}

/** Small drift toward the present for things close to it in time. */
function pullToward(from: Pt, anchor: Pt, minutes: number): Pt {
  if (minutes >= GRAVITY_MIN) return { x: 0, y: 0 }
  const dx = anchor.x - from.x
  const dy = anchor.y - from.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return { x: 0, y: 0 }
  const strength = 1 + (GRAVITY_PX - 1) * (1 - minutes / GRAVITY_MIN)
  const amount = Math.min(strength, dist * 0.25)
  return { x: (dx / dist) * amount, y: (dy / dist) * amount }
}

/* ------------------------------------------------------------------------ */
/* Labels                                                                    */
/* ------------------------------------------------------------------------ */

/** Approximate advance of spaced uppercase labels (letter-spacing .34em). */
function labelWidth(text: string, size: number): number {
  return text.length * (size * 0.64 + size * 0.34)
}

interface Obstacle extends Pt {
  r: number
  weight: number
}

const CANDIDATES: { dx: number; dy: number; h: HAlign; v: VAlign; bias: number }[] = [
  { dx: 1, dy: 0, h: 'left', v: 'middle', bias: 0 },
  { dx: 0.72, dy: -0.72, h: 'left', v: 'bottom', bias: 0.4 },
  { dx: 0.72, dy: 0.72, h: 'left', v: 'top', bias: 0.4 },
  { dx: -1, dy: 0, h: 'right', v: 'middle', bias: 1.2 },
  { dx: -0.72, dy: -0.72, h: 'right', v: 'bottom', bias: 1.6 },
  { dx: -0.72, dy: 0.72, h: 'right', v: 'top', bias: 1.6 },
  { dx: 0, dy: -1, h: 'center', v: 'bottom', bias: 2.2 },
  { dx: 0, dy: 1, h: 'center', v: 'top', bias: 2.2 },
]

function boxFor(x: number, y: number, h: HAlign, v: VAlign, width: number, height: number): Box {
  const left = h === 'left' ? x : h === 'right' ? x - width : x - width / 2
  const top = v === 'top' ? y : v === 'bottom' ? y - height : y - height / 2
  return { left, top, width, height }
}

function overlaps(a: Box, b: Box, margin = 0): boolean {
  return (
    a.left < b.left + b.width + margin &&
    b.left < a.left + a.width + margin &&
    a.top < b.top + b.height + margin &&
    b.top < a.top + a.height + margin
  )
}

function placeLabel(
  at: Pt,
  distance: number,
  size: { width: number; height: number },
  frame: Frame,
  obstacles: Obstacle[],
  taken: Box[],
  /** Unit vector the label would rather extend toward. */
  prefer?: Pt,
): LabelSpot & { clash: boolean } {
  let best: (LabelSpot & { clash: boolean }) | undefined
  let bestScore = Infinity
  const edge = 12
  for (const c of CANDIDATES) {
    const x = at.x + c.dx * distance
    const y = at.y + c.dy * distance
    const box = boxFor(x, y, c.h, c.v, size.width, size.height)
    let score = prefer ? (1 - (c.dx * prefer.x + c.dy * prefer.y) / Math.hypot(c.dx, c.dy)) * 3 : c.bias
    const overflow =
      Math.max(0, edge - box.left) +
      Math.max(0, box.left + box.width - (frame.width - edge)) +
      Math.max(0, edge + 24 - box.top) +
      Math.max(0, box.top + box.height - (frame.height - edge))
    score += overflow * 4
    for (const o of obstacles) {
      const nx = Math.max(box.left, Math.min(o.x, box.left + box.width))
      const ny = Math.max(box.top, Math.min(o.y, box.top + box.height))
      if (Math.hypot(o.x - nx, o.y - ny) < o.r + 4) score += o.weight
    }
    const clash = taken.some((t) => overlaps(box, t, 12))
    if (clash) score += 60
    if (score < bestScore) {
      bestScore = score
      best = { x, y, h: c.h, v: c.v, box, clash }
    }
  }
  return best!
}

function clock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/* ------------------------------------------------------------------------ */
/* Layout                                                                    */
/* ------------------------------------------------------------------------ */

export function layoutDayField(model: DayFieldModel, width: number, height: number): DayFieldLayout {
  const frame = frameFor(width, height)
  const { unit, anchor } = frame
  // The sway's phase slides a little with the hour: every moment gets its own
  // composition while the trajectory stays diagonal through the present.
  const curve = buildCurve(frame, -0.45 + Math.min(Math.max(model.nowU, 0), 1) * 0.9)
  const k = fitScale(model, frame, curve)
  const { sig, at } = arrange(model, k, unit)

  // Nodes. Off the exact line by a few pixels, alternating sides: a field, not a timeline.
  const nodes: PlacedNode[] = model.nodes.map((node, i) => {
    const on = curve.at(sig[i])
    const n = normal(on.angle)
    const lift = node === model.current ? 0 : (i % 2 ? 1 : -1) * (3 + (hash(node.id) % 100) / 100 * (node.role === 'major' ? 5 : 9)) * unit
    const p = { x: on.x + n.x * lift, y: on.y + n.y * lift }
    const depth = getTemporalDepth(node, model.now)
    return {
      node,
      x: p.x,
      y: p.y,
      sigma: sig[i],
      depth,
      r: (node === model.current ? CURRENT_RADIUS : radiusOf(node)) * unit,
      pull: node === model.current ? { x: 0, y: 0 } : pullToward(p, anchor, depth.minutes),
      hit: 0,
    }
  })
  const current = nodes.find((n) => n.node === model.current)!
  for (const n of nodes) {
    const nearest = Math.min(...nodes.filter((m) => m !== n).map((m) => Math.hypot(m.x - n.x, m.y - n.y)))
    n.hit = Math.min(Math.max(nearest / 2, n === current ? 22 : 12), n === current ? 30 : 24)
  }

  // Fragments: only where there is activity. Spaces keep the trajectory open,
  // and each fragment parts around its own mark instead of crossing it.
  const fragments: Fragment[] = []
  for (const p of nodes) {
    const { node } = p
    if (node.role !== 'medium' && node.role !== 'major' && node !== model.current) continue
    const a = at(node.uStart)
    const b = at(node.uEnd)
    const isCurrent = node === model.current
    const clear = (isCurrent ? CURRENT_RADIUS + 3 : radiusOf(node) * 0.95 + 2.5) * unit
    const base = {
      f: isCurrent ? 0 : p.depth.f,
      major: node.role === 'major',
      current: isCurrent,
    }
    const before = p.sigma - clear
    const after = p.sigma + clear
    const piece = (id: string, from: number, to: number, side: Fragment['side']) =>
      fragments.push({ ...base, id, side, d: pathBetween(curve, from, to), samples: samplesBetween(curve, from, to, 11 * unit) })
    if (before - a > 3) piece(`${node.id}-a`, a, before, isCurrent || node.temporal === 'past' ? 'past' : 'future')
    if (b - after > 3) piece(`${node.id}-b`, after, b, isCurrent || node.temporal === 'future' ? 'future' : 'past')
  }

  // Micro-points: density follows the concentration a block asks for.
  const points: MicroPoint[] = []
  for (const p of nodes) {
    const { node } = p
    const count = Math.round(node.concentration * MAX_POINTS)
    if (!count) continue
    const rand = random(hash(node.id))
    const long = node.role === 'major' || node.role === 'medium' || node === model.current
    const a = long ? at(node.uStart) : p.sigma - 8 * unit
    const b = long ? at(node.uEnd) : p.sigma + 8 * unit
    for (let j = 0; j < count; j++) {
      const s = a + (b - a) * rand()
      const base = curve.at(s)
      const n = normal(base.angle)
      const off = (rand() < 0.5 ? -1 : 1) * (4 + rand() * rand() * 14) * unit
      const pt = { x: base.x + n.x * off, y: base.y + n.y * off }
      points.push({
        id: `${node.id}-p${j}`,
        ...pt,
        r: (0.8 + rand() * 0.55) * unit,
        o: 0.34 + rand() * 0.34,
        side: node.temporal,
        f: p.depth.f,
        pull: node === model.current ? { x: 0, y: 0 } : pullToward(pt, anchor, p.depth.minutes),
      })
    }
  }

  // Spaces: diffuse light and a few loose points, never a node.
  const glows: SpaceGlow[] = []
  for (const space of model.spaces) {
    const minutes = space.endMin - space.startMin
    const side = sideOf((space.uStart + space.uEnd) / 2, model.nowU)
    const a = at(space.uStart)
    const b = at(space.uEnd)
    const rand = random(hash(space.id))
    if (minutes >= 40) {
      const mid = curve.at((a + b) / 2)
      const n = normal(mid.angle)
      const off = (rand() < 0.5 ? -1 : 1) * 6 * unit
      glows.push({
        id: space.id,
        x: mid.x + n.x * off,
        y: mid.y + n.y * off,
        r: (14 + (Math.min(minutes, 120) / 120) * 16) * unit,
        side,
      })
    }
    const loose = Math.floor(minutes / 45)
    const minutesAway = side === 'past' ? model.now - space.endMin : space.startMin - model.now
    for (let j = 0; j < loose; j++) {
      const base = curve.at(a + (b - a) * (0.2 + rand() * 0.6))
      const n = normal(base.angle)
      const off = (rand() < 0.5 ? -1 : 1) * (8 + rand() * 12) * unit
      const pt = { x: base.x + n.x * off, y: base.y + n.y * off }
      points.push({
        id: `${space.id}-p${j}`,
        ...pt,
        r: 0.85 * unit,
        o: 0.26,
        side,
        f: Math.min(1, Math.max(0, minutesAway) / 300),
        pull: pullToward(pt, anchor, Math.max(0, minutesAway)),
      })
    }
  }

  const scale = frame.portrait ? MODULE_SCALE.portrait : MODULE_SCALE.landscape
  const pitch = 6 * scale

  // Labels. Obstacles: marks and the drawn trajectory.
  const obstacles: Obstacle[] = [
    ...nodes.map((n) => ({ x: n.x, y: n.y, r: n.r + 2, weight: n === current ? 40 : 8 })),
    ...points.map((p) => ({ x: p.x, y: p.y, r: p.r, weight: 1 })),
  ]
  for (const p of nodes) {
    if (p.node.role !== 'medium' && p.node.role !== 'major' && p !== current) continue
    const a = at(p.node.uStart)
    const b = at(p.node.uEnd)
    for (let s = a; s <= b; s += 6) obstacles.push({ ...curve.at(s), r: 1, weight: 3 })
  }
  const taken: Box[] = []

  const nameMax = frame.portrait ? 170 : 240
  const name = model.current.name
  const nameWidth = labelWidth(name, 12)
  const nameLines = Math.max(1, Math.ceil(nameWidth / nameMax))
  const currentSize = {
    width: Math.max(Math.min(nameWidth, nameMax), labelWidth('AHORA', 10), 76),
    height: 10 + 9 + nameLines * 17 + 7 + 13,
  }
  const currentSpot: LabelSpot = placeLabel(current, (CURRENT_RADIUS + 12) * unit, currentSize, frame, obstacles, taken)
  taken.push(currentSpot.box)

  const onScreen = (n: FieldNode) => {
    const p = nodes.find((q) => q.node === n)
    return Boolean(p && p.x > 16 && p.x < width - 16 && p.y > 40 && p.y < height - 16)
  }
  const chosen = getVisibleLabels(model, onScreen)
  // Secondary names are optional: without a clear place, they are left out.
  const labelFor = (n: FieldNode | undefined) => {
    if (!n) return undefined
    const node = nodes.find((q) => q.node === n)!
    const { clash, ...spot } = placeLabel(
      node,
      node.r * (node.depth.side === 'past' ? 1 - 0.38 * node.depth.f : 1) + 6 * unit,
      { width: Math.min(labelWidth(n.name, 10), nameMax), height: 11 },
      frame,
      obstacles,
      taken,
    )
    if (clash) return undefined
    taken.push(spot.box)
    return { node, spot }
  }
  const next = labelFor(chosen.next)
  const previous = labelFor(chosen.previous)

  // Time references: where the configured day starts and ends.
  // Each sits just beyond its end of the trajectory, continuing its direction.
  const anchorAt = (u: number, min: number, outward: 1 | -1): TimeAnchor | undefined => {
    const p = curve.at(at(u))
    const point = {
      x: Math.min(Math.max(p.x, frame.safe.left), frame.safe.right),
      y: Math.min(Math.max(p.y, frame.safe.top), frame.safe.bottom),
    }
    const text = clock(min)
    const prefer = { x: Math.cos(p.angle) * outward, y: Math.sin(p.angle) * outward }
    const { clash, ...spot } = placeLabel(point, 10 * unit, { width: text.length * 7, height: 11 }, frame, obstacles, taken, prefer)
    if (clash) return undefined
    taken.push(spot.box)
    return { text, point, spot }
  }
  const start = anchorAt(0, model.dayStart, -1)
  const end = anchorAt(1, model.dayEnd, 1)

  return {
    width,
    height,
    portrait: frame.portrait,
    unit,
    anchor,
    nodes,
    current,
    fragments,
    points,
    glows,
    start,
    end,
    labels: { current: currentSpot, previous, next },
    module: { pitch, scale },
    k,
  }
}

/**
 * Where each element comes from as the field organizes: the ambient points of
 * the entry take the most important places; everything else rises out of the
 * dissolving message.
 */
export function fieldOrigins(layout: DayFieldLayout, ambient: Pt[]): Map<string, Pt & { o: number }> {
  const origins = new Map<string, Pt & { o: number }>()
  const priority = (n: PlacedNode) =>
    n === layout.current ? 0 : n.node.role === 'major' ? 1 : n.node.role === 'medium' ? 2 : n.node.role === 'endpoint' ? 3 : 4
  const free = [...ambient]
  for (const n of [...layout.nodes].sort((a, b) => priority(a) - priority(b))) {
    if (!free.length) break
    let best = 0
    for (let i = 1; i < free.length; i++) {
      if (Math.hypot(free[i].x - n.x, free[i].y - n.y) < Math.hypot(free[best].x - n.x, free[best].y - n.y)) best = i
    }
    origins.set(n.node.id, { ...free[best], o: 0.7 })
    free.splice(best, 1)
  }

  // The message block: centered, a few lines tall.
  const textWidth = Math.min(layout.width - 48, 544) * 0.85
  const textHeight = layout.portrait ? 130 : 110
  const cx = layout.width / 2
  const cy = layout.height / 2
  const rand = random(7)
  const fromText = () => ({
    x: cx + (rand() - 0.5) * textWidth,
    y: cy + (rand() - 0.5) * textHeight,
    o: 0,
  })
  for (const n of layout.nodes) if (!origins.has(n.node.id)) origins.set(n.node.id, fromText())
  for (const p of layout.points) origins.set(p.id, fromText())
  return origins
}
