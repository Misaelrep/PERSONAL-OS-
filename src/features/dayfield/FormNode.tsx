import { animate, m, motionValue, useTransform, type AnimationPlaybackControls, type MotionValue, type Transition } from 'framer-motion'
import type { CSSProperties } from 'react'
import type { PlacedNode, Pt } from './geometry'
import { SHAPES, between, burst, pathOf, type FormId, type Fragment } from './forms'
import type { FieldNode } from './model'
import { easeOut } from './particles'

/**
 * A node of the DAY FIELD drawn as one of the five configurations of the same
 * matter. Its morph and its breakup live in motion values, so the field can
 * change shape without re-rendering React, stop a morph halfway when the node
 * is inspected, and resume it later.
 */
export interface NodeRec {
  /** Fragments the running morph starts from (a form, or a shape caught mid-morph). */
  from: Fragment[]
  to: FormId
  progress: MotionValue<number>
  /** 0 → 1 while the form comes apart. */
  dissolve: MotionValue<number>
  anim?: AnimationPlaybackControls
  /** Seconds of the running morph, to resume it at the same pace. */
  duration: number
  paused: boolean
}

/** Organic easing: slow in, long soft landing. */
export const ORGANIC = [0.45, 0.05, 0.25, 1] as const

export function makeRec(form: FormId): NodeRec {
  return { from: SHAPES[form], to: form, progress: motionValue(1), dissolve: motionValue(0), duration: 2, paused: false }
}

export function displayed(rec: NodeRec): Fragment[] {
  const t = rec.progress.get()
  return SHAPES[rec.to].map((f, i) => between(rec.from[i], f, t))
}

export function isMorphing(rec: NodeRec): boolean {
  return rec.progress.get() < 1
}

/** The same matter moves to another configuration, from wherever it is now. */
export function startMorph(rec: NodeRec, to: FormId, seconds: number, speed: number): void {
  rec.anim?.stop()
  rec.from = displayed(rec)
  rec.to = to
  rec.duration = seconds
  rec.progress.set(0)
  rec.anim = animate(rec.progress, 1, { duration: seconds * speed, ease: ORGANIC })
}

export function pauseMorph(rec: NodeRec): void {
  rec.anim?.stop()
  rec.paused = true
}

export function resumeMorph(rec: NodeRec, speed: number, seconds?: number): void {
  rec.paused = false
  const p = rec.progress.get()
  if (p >= 1) return
  rec.anim = animate(rec.progress, 1, { duration: (seconds ?? (1 - p) * rec.duration) * speed, ease: 'easeOut' })
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Dash geometry of a fragment while its form comes apart (pathLength units). */
function erosion(form: FormId, e: number): { length: number; offset: number; spacing: number; stroke: number; fill: number } {
  switch (form) {
    case 'cardinal':
    case 'dissolving':
      // From both ends toward the middle.
      return { length: 1 - e, offset: e / 2, spacing: 1, stroke: 1 - smooth(0.85, 1, e), fill: 1 }
    case 'axis':
      // From the center outward (fragments run inner → outer).
      return { length: 1 - e, offset: e, spacing: 1, stroke: 1 - smooth(0.85, 1, e), fill: 1 }
    case 'orbit': {
      // The arc breaks into pieces along its curvature, then lets go.
      const k = smooth(0, 0.45, e)
      return { length: 1 - 0.84 * k, offset: 0, spacing: 0.12, stroke: 1 - smooth(0.45, 1, e), fill: 1 }
    }
    case 'prism':
      // Facets lose their edge first, then their light.
      return { length: 1, offset: 0, spacing: 1, stroke: 1 - smooth(0, 0.35, e), fill: 1 - smooth(0.3, 0.95, e) }
  }
}

/** Hairlines and facets are faint by design; this lifts them just enough on the pearl ground. */
const STROKE_GAIN = 1.25
const FILL_GAIN = 1.6

export function FragmentPath({ rec, i, radius, color, width }: { rec: NodeRec; i: number; radius: number; color: string; width: number }) {
  const shape = (t: number, e: number) => {
    const f = between(rec.from[i], SHAPES[rec.to][i], t)
    return e > 0 ? burst(f, rec.to, easeOut(e)) : f
  }
  const d = useTransform([rec.progress, rec.dissolve], ([t, e]: number[]) => pathOf(shape(t, e), 0, 0, radius))
  const strokeOpacity = useTransform([rec.progress, rec.dissolve], ([t, e]: number[]) => {
    const f = between(rec.from[i], SHAPES[rec.to][i], t)
    return Math.min(0.92, f.stroke * STROKE_GAIN) * erosion(rec.to, e).stroke
  })
  const fillOpacity = useTransform([rec.progress, rec.dissolve], ([t, e]: number[]) => {
    const f = between(rec.from[i], SHAPES[rec.to][i], t)
    return f.fill * FILL_GAIN * erosion(rec.to, e).fill
  })
  const strokeWidth = useTransform(rec.progress, (t) => between(rec.from[i], SHAPES[rec.to][i], t).width * width)
  const pathLength = useTransform(rec.dissolve, (e) => erosion(rec.to, e).length)
  const pathOffset = useTransform(rec.dissolve, (e) => erosion(rec.to, e).offset)
  const pathSpacing = useTransform(rec.dissolve, (e) => erosion(rec.to, e).spacing)
  return (
    <m.path
      d={d}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ stroke: color, fill: 'var(--df-facet)', strokeOpacity, fillOpacity, strokeWidth, pathLength, pathOffset, pathSpacing }}
    />
  )
}

/** Real stored state on the core, without symbols: solid, half, open or hollow. */
export function Core({ node, r, color }: { node: FieldNode; r: number; color: string }) {
  const stroke: CSSProperties = { stroke: color, fill: 'none' }
  const width = Math.max(0.7, r * 0.34)
  if (node.role === 'endpoint') {
    return (
      <>
        <circle r={r} strokeWidth={width} style={stroke} />
        <circle r={r * 0.36} style={{ fill: color }} />
      </>
    )
  }
  switch (node.execution) {
    case 'completed':
      return <circle r={r} style={{ fill: color, fillOpacity: 0.85 }} />
    case 'partial':
      return (
        <>
          <circle r={r} strokeWidth={width} style={stroke} />
          <path d={`M ${-r} 0 A ${r} ${r} 0 0 0 ${r} 0 Z`} style={{ fill: color, fillOpacity: 0.85 }} />
        </>
      )
    case 'skipped': {
      const a0 = -20 * (Math.PI / 180)
      const a1 = 250 * (Math.PI / 180)
      const d = `M ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 1 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)}`
      return <path d={d} strokeWidth={width} strokeLinecap="round" style={stroke} />
    }
    default:
      return <circle r={r} strokeWidth={width} style={stroke} />
  }
}

/** The four satellites of the modular core (edges of the AHORA module to come). */
export const SATELLITES: Pt[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

interface FormNodeProps {
  placed: PlacedNode
  rec: NodeRec
  /** Depth: size, presence and softness. */
  look: { scale: number; opacity: number; soft: number }
  color: string
  /** Presence of the whole node (group opacity target) and how to get there. */
  presence: number
  transition: Transition
  /** Where it appears from as the field organizes. */
  origin?: Pt & { o: number }
  pull: Pt
  selected: boolean
  /** Ambient life: drift and reflections. */
  alive: boolean
  index: number
  reduced: boolean
}

/** Any node except the present (see CurrentForm in DayField). */
export function FormNode({ placed, rec, look, color, presence, transition, origin, pull, selected, alive, index, reduced }: FormNodeProps) {
  const { node } = placed
  const radius = placed.r
  const core = Math.max(1.3, radius * 0.2)
  const coreOpacity = useTransform(rec.dissolve, (e) => 1 - smooth(0.55, 0.95, e))
  const modular = node.role === 'medium' || node.role === 'major'
  const filter = selected || look.soft <= 0.45 ? undefined : look.soft > 0.72 ? 'url(#df-blur-2)' : 'url(#df-blur-1)'
  return (
    <m.g
      initial={reduced ? { x: placed.x, y: placed.y, opacity: 0 } : { x: origin?.x ?? placed.x, y: origin?.y ?? placed.y, opacity: origin?.o ?? 0 }}
      animate={{ x: placed.x + pull.x, y: placed.y + pull.y, opacity: presence }}
      transition={transition}
    >
      <g
        className={alive ? 'df-drift' : undefined}
        style={alive ? { animationDuration: `${15 + ((index * 7) % 9)}s`, animationDelay: `${-((index * 3.7) % 11)}s` } : undefined}
      >
        <g className="df-dim" data-selected={selected || undefined}>
          <m.g initial={false} animate={{ scale: selected ? 1.16 : 1 }} transition={{ duration: 0.6, ease: ORGANIC }}>
            <g transform={`scale(${selected ? 1 : look.scale})`} filter={filter}>
              {SHAPES[rec.to].map((_, i) => (
                <FragmentPath key={i} rec={rec} i={i} radius={radius} color={color} width={node.role === 'micro' ? 0.8 : 1} />
              ))}
              <m.g style={{ opacity: coreOpacity }}>
                <Core node={node} r={core} color={color} />
                {modular &&
                  SATELLITES.map((s, i) => (
                    <circle key={i} cx={s.x * (core + 2.4)} cy={s.y * (core + 2.4)} r={0.55} style={{ fill: color, opacity: 0.45 }} />
                  ))}
              </m.g>
              {alive && modular && <Glint radius={radius} index={index} />}
            </g>
          </m.g>
        </g>
      </g>
    </m.g>
  )
}

/** A micro-reflection: rare, brief, like light catching glass. */
export function Glint({ radius, index }: { radius: number; index: number }) {
  const x = radius * 0.62
  const y = -radius * 0.66
  const s = 1.8
  return (
    <g className="df-glint" style={{ animationDuration: `${9 + ((index * 5) % 7)}s`, animationDelay: `${-((index * 2.9) % 9)}s` }}>
      <circle cx={x} cy={y} r={1.5} style={{ fill: 'var(--df-glow-ice-solid)' }} opacity={0.5} />
      <path d={`M${x - s} ${y}H${x + s}M${x} ${y - s}V${y + s}`} strokeWidth={0.6} strokeLinecap="round" style={{ stroke: '#fff' }} />
    </g>
  )
}
