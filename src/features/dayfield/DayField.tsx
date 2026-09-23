import { m, type Transition } from 'framer-motion'
import { useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { PRESETS } from '../../atmosphere/presets'
import { ActiveMatrix } from '../../components/dot/ActiveMatrix'
import { Label } from '../../components/ui/Label'
import { formatClock, formatRange } from '../../domain/time'
import type { EnergyState } from '../../domain/types'
import { useViewport } from '../../hooks/useViewport'
import { EASE } from '../../motion/tokens'
import {
  fieldOrigins,
  layoutDayField,
  type DayFieldLayout,
  type Fragment,
  type LabelSpot,
  type MicroPoint,
  type PlacedNode,
  type Pt,
} from './geometry'
import type { DayFieldModel, FieldNode } from './model'

/**
 * DAY FIELD — the day as a field around the present, shown once as the daily
 * entry resolves. Not interactive: it is read, then it collapses into AHORA.
 *
 * organize  points leave the message and the atmosphere and take their places
 * field     trajectory fragments, depth and the day's time references appear
 * present   the current node takes focus; AHORA, name and range
 * still     near stillness, time to read it
 * collapse  future → past → fragments → names → points released or absorbed
 * node      only the present remains, as the AHORA module
 * handoff   the module lands on HOY's AHORA while HOY materializes
 */
export type FieldStage = 'organize' | 'field' | 'present' | 'still' | 'collapse' | 'node' | 'handoff'

export const FIELD_STAGES: FieldStage[] = ['organize', 'field', 'present', 'still', 'collapse', 'node', 'handoff']

const reached = (stage: FieldStage, target: FieldStage) => FIELD_STAGES.indexOf(stage) >= FIELD_STAGES.indexOf(target)
const holding = (stage: FieldStage) => stage === 'present' || stage === 'still'

interface DayFieldProps {
  model: DayFieldModel
  stage: FieldStage
  /** Duration multiplier: 1 normal, below 1 for accelerated review. */
  speed: number
  /** Crossfades only: no travel, gravity, absorption or drift. */
  reduced: boolean
  /** Ambient points of the entry (px) that become the first nodes. */
  ambient: Pt[]
  /** HOY's AHORA shows the 3 × 3 matrix the module can land on. */
  landsOnMatrix: boolean
}

export function DayField({ model, stage, speed, reduced, ambient, landsOnMatrix }: DayFieldProps) {
  const { width, height } = useViewport()
  const layout = useMemo(() => layoutDayField(model, width, height), [model, width, height])
  // Where things come from is decided once, when the field first appears.
  const [origins] = useState(() => (reduced ? new Map<string, Pt & { o: number }>() : fieldOrigins(layout, ambient)))
  const tr = (duration: number, delay = 0): Transition => ({ duration: duration * speed, delay: delay * speed, ease: EASE })

  const current = model.current
  const range = current.kind === 'sleep' ? `hasta ${formatClock(current.endMin)}` : formatRange(current.startMin, current.endMin)
  const summary =
    current.kind === 'sleep'
      ? `Resumen visual del día. Actividad actual: ${current.title}, hasta las ${formatClock(current.endMin)}.`
      : `Resumen visual del día. Actividad actual: ${current.title}, de ${formatClock(current.startMin)} a ${formatClock(current.endMin)}.`

  const energies = [...new Set(layout.nodes.filter((n) => n.node.role === 'major').map((n) => n.node.energy))]

  return (
    <m.div
      className="day-field absolute inset-0"
      role="img"
      aria-label={summary}
      initial={{ opacity: 1 }}
      animate={{ opacity: reduced && stage === 'handoff' ? 0 : 1 }}
      transition={tr(0.45)}
    >
      <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 overflow-visible">
        <defs>
          <Glow id="df-glow" color="var(--df-space)" stops={[0.2, 0.08, 0]} />
          <Glow id="df-soft-past" color="var(--df-past)" stops={[0.28, 0.1, 0]} />
          <Glow id="df-soft-future" color="var(--df-future)" stops={[0.3, 0.12, 0]} />
          <Glow id="df-now-halo" color="var(--df-now)" stops={[0.34, 0.12, 0]} />
          {energies.map((e) => (
            <Glow key={e} id={`df-halo-${e}`} color={PRESETS[e].accent} stops={[0.36, 0.12, 0]} />
          ))}
          {/* Depth: a light, static softening for what is far from now. */}
          {[0.45, 0.8].map((d, i) => (
            <filter key={d} id={`df-blur-${i + 1}`} x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation={d} />
            </filter>
          ))}
        </defs>

        {layout.glows.map((g) => (
          <m.circle
            key={g.id}
            cx={g.x}
            cy={g.y}
            r={g.r}
            fill="url(#df-glow)"
            initial={{ opacity: 0 }}
            animate={{ opacity: reached(stage, 'collapse') || stage === 'organize' ? 0 : g.side === 'past' ? 0.7 : 1 }}
            transition={reached(stage, 'collapse') ? tr(0.4) : tr(1, 0.1)}
          />
        ))}

        <g fill="none" strokeLinecap="round">
          {layout.fragments.map((f) => (
            <FragmentPath key={f.id} fragment={f} stage={stage} reduced={reduced} tr={tr} unit={layout.unit} />
          ))}
        </g>

        <g>
          {layout.points.map((p, i) => (
            <Point key={p.id} point={p} index={i} stage={stage} reduced={reduced} layout={layout} origin={origins.get(p.id)} tr={tr} />
          ))}
        </g>

        <g>
          {layout.nodes
            .filter((n) => n !== layout.current)
            .map((n, i) => (
              <Node key={n.node.id} placed={n} index={i} stage={stage} reduced={reduced} origin={origins.get(n.node.id)} tr={tr} />
            ))}
        </g>

        <CurrentNode layout={layout} stage={stage} reduced={reduced} origin={origins.get(current.id)} tr={tr} />
      </svg>

      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Spot spot={layout.labels.current} layout={layout}>
          <m.span
            className="label-spaced block text-accent"
            style={{ fontSize: 10 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: reached(stage, 'field') && !reached(stage, 'collapse') ? 1 : 0 }}
            transition={reached(stage, 'collapse') ? tr(0.3, 0.4) : tr(0.6, 0.35)}
          >
            Ahora
          </m.span>
          <m.span
            className="label-spaced mt-[9px] block text-ink text-balance"
            style={{ fontSize: 12, lineHeight: 1.45, maxWidth: layout.portrait ? 170 : 240 }}
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={
              reached(stage, 'present') && !reached(stage, 'node')
                ? { opacity: 1, filter: 'blur(0px)' }
                : { opacity: 0, filter: 'blur(4px)' }
            }
            transition={tr(reached(stage, 'node') ? 0.3 : 0.6)}
          >
            {current.name}
          </m.span>
          <m.span
            className="tabular mt-[7px] block text-[12px] text-ink-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: reached(stage, 'present') && !reached(stage, 'collapse') ? 1 : 0 }}
            transition={reached(stage, 'collapse') ? tr(0.3, 0.4) : tr(0.6, 0.15)}
          >
            {range}
          </m.span>
        </Spot>

        {(['previous', 'next'] as const).map((which) => {
          const entry = layout.labels[which]
          if (!entry) return null
          return (
            <Spot key={which} spot={entry.spot} layout={layout}>
              <m.span
                className={`label-spaced block whitespace-nowrap ${which === 'next' ? 'text-ink-3' : 'text-ink-4'}`}
                style={{ fontSize: 10 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: holding(stage) ? (entry.node.node.temporal === 'past' ? 0.75 : 0.85) : 0 }}
                transition={reached(stage, 'collapse') ? tr(0.3, 0.3) : tr(0.7, 0.3)}
              >
                {entry.node.node.name}
              </m.span>
            </Spot>
          )
        })}

        {[layout.start, layout.end].map((a) =>
          a ? (
            <Spot key={a.text} spot={a.spot} layout={layout}>
              <m.span
                className="tabular block text-[10px] tracking-[0.08em] text-ink-4"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: stage === 'field' ? 1 : stage === 'present' ? 0.8 : stage === 'still' ? 0.3 : 0,
                }}
                transition={stage === 'still' ? tr(1.2) : stage === 'collapse' ? tr(0.3, 0.4) : tr(0.6, 0.3)}
              >
                {a.text}
              </m.span>
            </Spot>
          ) : null,
        )}

        {!reduced && reached(stage, 'node') && <Handoff layout={layout} stage={stage} landsOnMatrix={landsOnMatrix} tr={tr} />}
      </div>
    </m.div>
  )
}

type Tr = (duration: number, delay?: number) => Transition

function Glow({ id, color, stops }: { id: string; color: string; stops: [number, number, number] }) {
  return (
    <radialGradient id={id}>
      <stop offset="0" style={{ stopColor: color, stopOpacity: stops[0] }} />
      <stop offset="0.45" style={{ stopColor: color, stopOpacity: stops[1] }} />
      <stop offset="1" style={{ stopColor: color, stopOpacity: stops[2] }} />
    </radialGradient>
  )
}

/** Positions an HTML label at its attach point, extending away from its node. */
function Spot({ spot, layout, children }: { spot: LabelSpot; layout: DayFieldLayout; children: ReactNode }) {
  const style: CSSProperties = { position: 'absolute', textAlign: spot.h === 'center' ? 'center' : spot.h }
  if (spot.h === 'left') style.left = spot.x
  else if (spot.h === 'right') style.right = layout.width - spot.x
  else {
    style.left = spot.x - spot.box.width / 2
    style.width = spot.box.width
  }
  if (spot.v === 'top') style.top = spot.y
  else if (spot.v === 'bottom') style.bottom = layout.height - spot.y
  else {
    style.top = spot.y
    style.transform = 'translateY(-50%)'
  }
  return (
    <div style={style} className={spot.h === 'right' ? 'flex flex-col items-end' : spot.h === 'center' ? 'flex flex-col items-center' : ''}>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Depth                                                                     */
/* ------------------------------------------------------------------------ */

const COLOR = { past: 'var(--df-past)', future: 'var(--df-future)', current: 'var(--df-now)' } as const

/** Past dissolves (smaller, fainter, softer); the future is still forming. */
function look(p: PlacedNode) {
  const { side, f } = p.depth
  if (side === 'past') return { scale: 1 - 0.38 * f, opacity: Math.max(0.26, 0.88 - 0.56 * f), soft: f }
  if (side === 'future') return { scale: 1 - 0.18 * f, opacity: 0.74 - 0.3 * f, soft: 0.3 + 0.45 * f }
  return { scale: 1, opacity: 1, soft: 0 }
}

/** Real stored state, drawn without symbols: solid, half, open or hollow. */
function Mark({ node, r, color }: { node: FieldNode; r: number; color: string }) {
  const stroke: CSSProperties = { stroke: color, fill: 'none' }
  const width = Math.max(0.8, r * 0.26)
  if (node.role === 'endpoint') {
    return (
      <>
        <circle r={r} strokeWidth={width} style={stroke} />
        <circle r={r * 0.34} style={{ fill: color }} />
      </>
    )
  }
  switch (node.execution) {
    case 'completed':
      return <circle r={r} style={{ fill: color, fillOpacity: 0.75 }} />
    case 'partial':
      return (
        <>
          <circle r={r} strokeWidth={width} style={stroke} />
          <path d={`M ${-r} 0 A ${r} ${r} 0 0 0 ${r} 0 Z`} style={{ fill: color, fillOpacity: 0.75 }} />
        </>
      )
    case 'skipped': {
      // An interrupted ring: open on the upper right.
      const a0 = -20 * (Math.PI / 180)
      const a1 = 250 * (Math.PI / 180)
      const d = `M ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 1 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)}`
      return <path d={d} strokeWidth={width} strokeLinecap="round" style={stroke} />
    }
    default:
      return <circle r={r} strokeWidth={width} style={stroke} />
  }
}

function Node({
  placed,
  index,
  stage,
  reduced,
  origin,
  tr,
}: {
  placed: PlacedNode
  index: number
  stage: FieldStage
  reduced: boolean
  origin?: Pt & { o: number }
  tr: Tr
}) {
  const { node } = placed
  const { scale, opacity, soft } = look(placed)
  const side = placed.depth.side === 'past' ? 'past' : 'future'
  const color = COLOR[side]
  const r = placed.r * scale
  const pull = holding(stage) && !reduced ? placed.pull : { x: 0, y: 0 }
  const future = side === 'future'

  let target = opacity
  let transition = tr(1.1, 0.04 * (index % 6))
  if (stage === 'organize') target = opacity * 0.85
  else if (stage === 'field') transition = tr(0.7)
  else if (holding(stage)) {
    target = opacity * (reduced ? 0.6 : 0.9)
    transition = tr(1.4)
  } else if (reached(stage, 'collapse')) {
    // The future lets go first; the past follows.
    target = 0
    transition = future ? tr(0.35) : tr(0.4, 0.12)
  }

  return (
    <m.g
      initial={{ x: origin?.x ?? placed.x, y: origin?.y ?? placed.y, opacity: origin?.o ?? 0 }}
      animate={{ x: placed.x + pull.x, y: placed.y + pull.y, opacity: target }}
      transition={transition}
    >
      {node.role === 'major' && (
        <circle r={r * 4.4} fill={`url(#df-halo-${node.energy as EnergyState})`} opacity={future ? 0.9 : 0.6 * (1 - placed.depth.f * 0.6)} />
      )}
      {soft > 0.25 && <circle r={r * 2.6} fill={`url(#df-soft-${side})`} opacity={soft} />}
      <g filter={soft > 0.72 ? 'url(#df-blur-2)' : soft > 0.45 ? 'url(#df-blur-1)' : undefined}>
        <Mark node={node} r={r} color={color} />
      </g>
    </m.g>
  )
}

function FragmentPath({
  fragment: f,
  stage,
  reduced,
  tr,
  unit,
}: {
  fragment: Fragment
  stage: FieldStage
  reduced: boolean
  tr: Tr
  unit: number
}) {
  const base = f.current ? (f.side === 'past' ? 0.62 : 0.5) : f.side === 'past' ? 0.46 - 0.28 * f.f : 0.4 - 0.2 * f.f
  const shown = reached(stage, 'field') && !reached(stage, 'collapse')
  const opacity = shown ? base * (holding(stage) && !f.current ? 0.85 : 1) : 0
  return (
    <m.path
      d={f.d}
      strokeWidth={(f.major ? 1.15 : 1) * unit}
      style={{ stroke: f.side === 'past' ? 'var(--df-path)' : 'var(--df-future)' }}
      initial={{ pathLength: reduced ? 1 : 0, opacity: 0 }}
      animate={{ pathLength: reduced || reached(stage, 'field') ? 1 : 0, opacity }}
      transition={reached(stage, 'collapse') ? tr(0.4, 0.25) : { pathLength: tr(0.9, 0.05), opacity: tr(0.6) }}
    />
  )
}

function Point({
  point: p,
  index,
  stage,
  reduced,
  layout,
  origin,
  tr,
}: {
  point: MicroPoint
  index: number
  stage: FieldStage
  reduced: boolean
  layout: DayFieldLayout
  origin?: Pt & { o: number }
  tr: Tr
}) {
  const depth = p.side === 'past' ? 1 - 0.6 * p.f : p.side === 'future' ? 0.85 - 0.3 * p.f : 0.9
  const o = p.o * depth
  const color = p.side === 'current' ? COLOR.current : COLOR[p.side]
  let pose = { cx: p.x, cy: p.y, r: p.r, opacity: o }
  let transition = tr(1.15, 0.05 + ((index * 37) % 11) * 0.028)
  let fill: string = color

  if (stage === 'organize') pose.opacity = o * 0.8
  else if (stage === 'field') transition = tr(0.7)
  else if (holding(stage)) {
    if (!reduced) pose = { ...pose, cx: p.x + p.pull.x, cy: p.y + p.pull.y }
    pose.opacity = o * (reduced ? 0.6 : 0.9)
    transition = tr(1.4)
  } else if (reached(stage, 'collapse')) {
    if (reduced) pose.opacity = 0
    else if (p.fate === 'module' && p.cell) {
      // Survivors settle into the AHORA module; from `node` on, HOY's matrix takes over.
      pose = { cx: p.cell.x, cy: p.cell.y, r: p.cell.r, opacity: reached(stage, 'node') ? 0 : p.cell.o }
      fill = 'var(--ink-3)'
      transition = reached(stage, 'node') ? { duration: 0 } : tr(0.5, 0.4 + (index % 8) * 0.012)
    } else if (p.fate === 'absorb') {
      pose = { cx: layout.anchor.x, cy: layout.anchor.y, r: 0.3, opacity: 0 }
      transition = tr(0.45, 0.4)
    } else {
      pose = { ...pose, r: p.r * 1.8, opacity: 0 }
      transition = tr(0.4, 0.3)
    }
  }

  return (
    <m.circle
      initial={{ cx: origin?.x ?? p.x, cy: origin?.y ?? p.y, r: p.r * 0.8, opacity: origin?.o ?? 0 }}
      animate={pose}
      transition={transition}
      style={{ fill, transition: 'fill 0.5s ease' }}
    />
  )
}

/** Movement follows the energy state: the present breathes faster when the day asks for more. */
const PULSE_S: Record<EnergyState, number> = {
  activacion: 2.6,
  focus: 2.8,
  produccion: 2.8,
  cuerpo: 2.4,
  'segundo-pico': 3,
  recuperacion: 4.2,
  cierre: 5,
}

function CurrentNode({
  layout,
  stage,
  reduced,
  origin,
  tr,
}: {
  layout: DayFieldLayout
  stage: FieldStage
  reduced: boolean
  origin?: Pt & { o: number }
  tr: Tr
}) {
  const { anchor, unit, module } = layout
  const collapsing = reached(stage, 'collapse')
  const gone = !reduced && reached(stage, 'node')
  const halo = stage === 'organize' ? 0 : stage === 'field' ? 0.55 : holding(stage) ? 1 : 0
  const core = stage === 'organize' ? 3 * unit : stage === 'field' ? 4.2 * unit : holding(stage) ? 4.8 * unit : 2.2 * module.scale
  return (
    <m.g
      initial={{ x: origin?.x ?? anchor.x, y: origin?.y ?? anchor.y, opacity: origin?.o ?? 0 }}
      animate={{ x: anchor.x, y: anchor.y, opacity: gone ? 0 : 1 }}
      transition={gone ? { duration: 0 } : tr(1.05)}
    >
      <m.circle
        r={30 * unit}
        fill="url(#df-now-halo)"
        initial={{ opacity: 0 }}
        animate={{ opacity: halo }}
        transition={collapsing ? tr(0.5, 0.3) : tr(0.9)}
      />
      <m.circle
        fill="none"
        strokeWidth={0.8}
        style={{ stroke: 'var(--df-now)' }}
        initial={{ r: 7 * unit, opacity: 0 }}
        animate={{ r: holding(stage) ? 10.5 * unit : 7 * unit, opacity: holding(stage) ? 0.4 : 0 }}
        transition={collapsing ? tr(0.4, 0.2) : tr(0.9)}
      />
      {holding(stage) && !reduced && (
        <circle
          className="matrix-pulse"
          r={core}
          style={{ fill: 'var(--df-now)', animationDuration: `${PULSE_S[layout.current.node.energy]}s` }}
        />
      )}
      <m.circle
        style={{ fill: 'var(--df-now)' }}
        initial={{ r: 3 * unit }}
        animate={{ r: core }}
        transition={collapsing ? tr(0.5, 0.4) : tr(0.8)}
      />
    </m.g>
  )
}

/**
 * NODE → AHORA. The module that remains takes its name, then lands exactly on
 * HOY's AHORA marker while HOY materializes underneath.
 */
function Handoff({
  layout,
  stage,
  landsOnMatrix,
  tr,
}: {
  layout: DayFieldLayout
  stage: FieldStage
  landsOnMatrix: boolean
  tr: Tr
}) {
  const { anchor, module } = layout
  const [target, setTarget] = useState<{ matrix: DOMRect; label: DOMRect } | null>(null)

  useLayoutEffect(() => {
    if (stage !== 'handoff') return
    let frame = 0
    const find = () => {
      const matrix = document.querySelector('[data-now-matrix]')
      const label = document.querySelector('[data-now-label]')
      if (matrix && label) setTarget({ matrix: matrix.getBoundingClientRect(), label: label.getBoundingClientRect() })
      else frame = requestAnimationFrame(find)
    }
    find()
    return () => cancelAnimationFrame(frame)
  }, [stage])

  const labelLeft = anchor.x + 9 * module.scale + 12
  const labelTop = anchor.y - 5.5

  return (
    <>
      <m.div
        className="absolute text-ink-3"
        style={{ left: anchor.x - 9, top: anchor.y - 9, width: 18, height: 18 }}
        initial={{ x: 0, y: 0, scale: module.scale, opacity: 1 }}
        animate={
          target
            ? {
                x: target.matrix.left + target.matrix.width / 2 - anchor.x,
                y: target.matrix.top + target.matrix.height / 2 - anchor.y,
                scale: 1,
                opacity: landsOnMatrix ? 1 : 0,
              }
            : { x: 0, y: 0, scale: module.scale, opacity: 1 }
        }
        transition={tr(0.62)}
      >
        <ActiveMatrix />
      </m.div>
      <m.div
        className="absolute flex"
        style={{ left: labelLeft, top: labelTop }}
        initial={{ x: 0, y: 0, opacity: 0 }}
        animate={
          target
            ? { x: target.label.left - labelLeft, y: target.label.top - labelTop, opacity: 1 }
            : { x: 0, y: 0, opacity: 1 }
        }
        transition={target ? tr(0.62) : tr(0.3, 0.12)}
      >
        <Label className="text-ink-2">Ahora</Label>
      </m.div>
    </>
  )
}
