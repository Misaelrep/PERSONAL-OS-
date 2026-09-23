import { AnimatePresence, animate, m, type Transition } from 'framer-motion'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { PRESETS } from '../../atmosphere/presets'
import { ActiveMatrix } from '../../components/dot/ActiveMatrix'
import { Label } from '../../components/ui/Label'
import { formatClock, formatRange } from '../../domain/time'
import type { EnergyState } from '../../domain/types'
import { useViewport } from '../../hooks/useViewport'
import { EASE } from '../../motion/tokens'
import { AstralFade } from './AstralFade'
import { SHAPES, assignForms, morphPlan, nextForm, type MorphEvent } from './forms'
import {
  FragmentPath,
  FormNode,
  ORGANIC,
  SATELLITES,
  displayed,
  isMorphing,
  makeRec,
  pauseMorph,
  resumeMorph,
  startMorph,
  type NodeRec,
} from './FormNode'
import {
  fieldOrigins,
  layoutDayField,
  type DayFieldLayout,
  type Fragment as Trail,
  type LabelSpot,
  type MicroPoint,
  type PlacedNode,
  type Pt,
} from './geometry'
import { MicroCard, stateLabel } from './MicroCard'
import type { DayFieldModel } from './model'
import { ParticleCanvas } from './ParticleCanvas'
import { ERODE_MS, assignFates, emitForm, emitPoints, emitTrail, type Gathering, type Particle } from './particles'

/**
 * DAY FIELD — the day as a field around the present, made of one visual
 * matter that takes five configurations (POLYMORPHIC APERTURE SYSTEM).
 *
 * organize       points leave the message and the atmosphere and take their places
 * field          each node adopts one of the five forms; depth, fragments, time references
 * present        AHORA takes the lead: name and range
 * explore        slow polymorphic life; any node can be inspected (≥ 15 s in all)
 * settle         morphs finish; the present arrives at Dissolving
 * dematerialize  each form comes apart in its own way
 * particles      only matter remains
 * gather         matter converges on AHORA; the modular core becomes the 3 × 3 module
 * handoff        the module lands on HOY's AHORA while HOY materializes
 */
export type FieldStage =
  | 'organize'
  | 'field'
  | 'present'
  | 'explore'
  | 'settle'
  | 'dematerialize'
  | 'particles'
  | 'gather'
  | 'handoff'

export const FIELD_STAGES: FieldStage[] = [
  'organize',
  'field',
  'present',
  'explore',
  'settle',
  'dematerialize',
  'particles',
  'gather',
  'handoff',
]

const reached = (stage: FieldStage, target: FieldStage) => FIELD_STAGES.indexOf(stage) >= FIELD_STAGES.indexOf(target)
/** Names are read here. */
const reading = (stage: FieldStage) => stage === 'present' || stage === 'explore'
/** The field is alive and open to inspection. */
const open = (stage: FieldStage) => reached(stage, 'field') && !reached(stage, 'settle')

interface DayFieldProps {
  model: DayFieldModel
  stage: FieldStage
  /** Duration multiplier: 1 normal, below 1 for accelerated review. */
  speed: number
  /** Static variety and crossfades: no morph, drift or particle travel. */
  reduced: boolean
  /** Ambient points of the entry (px) that become the first nodes. */
  ambient: Pt[]
  /** HOY's AHORA shows the 3 × 3 matrix the module can land on. */
  landsOnMatrix: boolean
  /** Review mode: the field keeps living, no automatic exit. */
  hold: boolean
  onInspect: (open: boolean) => void
}

type Tr = (duration: number, delay?: number) => Transition

const COLOR = { past: 'var(--df-line-past)', future: 'var(--df-line-future)', current: 'var(--df-line-now)' } as const
const POINT_COLOR = { past: 'var(--df-past)', future: 'var(--df-future)', current: 'var(--df-now-core)' } as const

/** Past dissolves (smaller, fainter, softer); the future is still forming. */
function look(p: PlacedNode) {
  const { side, f } = p.depth
  if (side === 'past') return { scale: 1 - 0.32 * f, opacity: Math.max(0.32, 0.9 - 0.52 * f), soft: f }
  if (side === 'future') return { scale: 1 - 0.18 * f, opacity: 0.8 - 0.3 * f, soft: 0.3 + 0.45 * f }
  return { scale: 1, opacity: 1, soft: 0 }
}

/** How strongly each role carries its own light. */
const FADE_WEIGHT = { micro: 0.5, medium: 0.72, major: 0.9, endpoint: 0.6, space: 0.8 } as const

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

/** Far forms come apart first; the present is always the last. */
const RELEASE_SPREAD_MS = 650
const CURRENT_RELEASE_MS = 1000

/** Memoized: the entry re-renders around it (e.g. CONTINUAR) without redrawing the field. */
export const DayField = memo(function DayField({
  model,
  stage,
  speed,
  reduced,
  ambient,
  landsOnMatrix,
  hold,
  onInspect,
}: DayFieldProps) {
  const { width, height } = useViewport()
  const layout = useMemo(() => layoutDayField(model, width, height), [model, width, height])
  // Where things come from is decided once, when the field first appears.
  const [origins] = useState(() => (reduced ? new Map<string, Pt & { o: number }>() : fieldOrigins(layout, ambient)))
  const tr: Tr = useCallback(
    (duration, delay = 0) => ({ duration: duration * speed, delay: delay * speed, ease: EASE }),
    [speed],
  )

  // Field clock, in unscaled milliseconds since the field began.
  const [t0] = useState(() => performance.now())
  const clock = useCallback(() => (performance.now() - t0) / speed, [t0, speed])
  const stageRef = useRef(stage)
  stageRef.current = stage

  const current = layout.current
  const currentId = model.current.id

  // One record of matter per node: its configuration, morph and breakup.
  const [recs] = useState(() => {
    const forms = assignForms(
      layout.nodes.map((n) => n.node.id),
      currentId,
    )
    return new Map<string, NodeRec>(layout.nodes.map((n) => [n.node.id, makeRec(forms.get(n.node.id)!)]))
  })

  /* ---------------------------------------------------------------------- */
  /* Inspection                                                              */
  /* ---------------------------------------------------------------------- */

  const [selected, setSelected] = useState<string | null>(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const inspectRef = useRef(onInspect)
  inspectRef.current = onInspect
  useEffect(() => inspectRef.current(Boolean(selected)), [selected])

  const release = useCallback(
    (id: string) => {
      // After a moment, the node returns slowly to its own cycle.
      window.setTimeout(() => {
        const rec = recs.get(id)
        if (rec && selectedRef.current !== id && open(stageRef.current)) resumeMorph(rec, speed)
      }, 800 * speed)
    },
    [recs, speed],
  )
  const close = useCallback(() => {
    const prev = selectedRef.current
    if (!prev) return
    setSelected(null)
    release(prev)
  }, [release])
  const select = useCallback(
    (id: string) => {
      const prev = selectedRef.current
      if (prev === id) return close()
      if (prev) release(prev)
      // Interaction wins over animation: the form holds still while inspected.
      pauseMorph(recs.get(id)!)
      setSelected(id)
    },
    [close, recs, release],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  /* ---------------------------------------------------------------------- */
  /* Polymorphic life                                                        */
  /* ---------------------------------------------------------------------- */

  const onScreen = useCallback(
    (p: PlacedNode) => p.x > 12 && p.x < width - 12 && p.y > 40 && p.y < height - 12,
    [width, height],
  )

  useEffect(() => {
    if (reduced) return
    const plan = morphPlan(hold ? 3600 : 16, hold)
    let next = 0
    const run = (event: MorphEvent) => {
      if (event.target === 'current') {
        const rec = recs.get(currentId)!
        if (selectedRef.current !== currentId) startMorph(rec, nextForm(rec.to), event.duration, speed)
        return
      }
      // Secondary nodes, picked by their place along the day so changes happen in different zones.
      const candidates = layout.nodes.filter((p) => {
        const rec = recs.get(p.node.id)!
        return (
          p !== current &&
          p.node.role !== 'micro' &&
          onScreen(p) &&
          !isMorphing(rec) &&
          !rec.paused &&
          selectedRef.current !== p.node.id
        )
      })
      if (!candidates.length) return
      const pick = candidates[Math.round((event.target as number) * (candidates.length - 1))]
      const rec = recs.get(pick.node.id)!
      startMorph(rec, nextForm(rec.to), event.duration, speed)
    }
    const id = window.setInterval(() => {
      const now = clock() / 1000
      while (next < plan.length && plan[next].at <= now) {
        const event = plan[next++]
        if (open(stageRef.current)) run(event)
      }
    }, 120)
    return () => window.clearInterval(id)
  }, [reduced, hold, recs, currentId, layout, current, onScreen, speed, clock])

  // SETTLE: morphs complete; the present arrives at Dissolving.
  useEffect(() => {
    if (stage !== 'settle') return
    setSelected(null)
    for (const [id, rec] of recs) if (id !== currentId && isMorphing(rec)) resumeMorph(rec, speed, 0.8)
    if (reduced) return
    const cur = recs.get(currentId)!
    if (cur.to !== 'dissolving') startMorph(cur, 'dissolving', 1.2, speed)
    else if (isMorphing(cur)) resumeMorph(cur, speed, 1)
  }, [stage, recs, currentId, speed, reduced])

  /* ---------------------------------------------------------------------- */
  /* Dematerialization → particles → AHORA                                   */
  /* ---------------------------------------------------------------------- */

  const maxDistance = useMemo(
    () => Math.max(1, ...layout.nodes.map((n) => Math.hypot(n.x - layout.anchor.x, n.y - layout.anchor.y))),
    [layout],
  )
  /** When (ms after the breakup starts) something at this place lets go. */
  const releaseDelay = useCallback(
    (p: Pt) => (1 - Math.min(1, Math.hypot(p.x - layout.anchor.x, p.y - layout.anchor.y) / maxDistance)) * RELEASE_SPREAD_MS,
    [layout, maxDistance],
  )

  const [particles] = useState<Particle[]>(() => [])
  const gathering = useRef<Gathering | undefined>(undefined)

  useEffect(() => {
    if (stage !== 'dematerialize' || reduced) return
    const start = clock()
    const rand = seeded(11)
    for (const p of layout.nodes) {
      const rec = recs.get(p.node.id)!
      const isCurrent = p === current
      const delay = isCurrent ? CURRENT_RELEASE_MS : releaseDelay(p)
      const l = look(p)
      animate(rec.dissolve, 1, { duration: (ERODE_MS[rec.to] / 1000) * speed, delay: (delay / 1000) * speed, ease: 'linear' })
      emitForm(
        particles,
        {
          form: rec.to,
          fragments: displayed(rec),
          x: p.x + p.pull.x,
          y: p.y + p.pull.y,
          radius: p.r * l.scale,
          start: start + delay,
          alpha: l.opacity,
          unit: layout.unit,
        },
        rand,
      )
    }
    emitPoints(
      particles,
      layout.points.map((p) => ({ x: p.x, y: p.y, r: p.r, o: p.o, start: start + releaseDelay(p) })),
      rand,
    )
    for (const f of layout.fragments) {
      const mid = f.samples[Math.floor(f.samples.length / 2)] ?? layout.anchor
      emitTrail(particles, f.samples, start + releaseDelay(mid), 700, 0.45, layout.unit, rand)
    }
  }, [stage, reduced, clock, layout, recs, current, releaseDelay, particles, speed])

  const scale = layout.module.scale
  const pitch = layout.module.pitch
  useEffect(() => {
    if (stage !== 'gather' || reduced) return
    const { anchor } = layout
    const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: anchor.x + sx * pitch, y: anchor.y + sy * pitch, r: scale, a: 0.35 })))
    assignFates(particles, anchor, corners, seeded(5))
    gathering.current = { start: clock(), anchor }
  }, [stage, reduced, layout, particles, clock, pitch, scale])

  /* ---------------------------------------------------------------------- */
  /* Drawing                                                                 */
  /* ---------------------------------------------------------------------- */

  const range =
    model.current.kind === 'sleep'
      ? `hasta ${formatClock(model.current.endMin)}`
      : formatRange(model.current.startMin, model.current.endMin)
  const summary =
    model.current.kind === 'sleep'
      ? `Resumen visual del día. Actividad actual: ${model.current.title}, hasta las ${formatClock(model.current.endMin)}.`
      : `Resumen visual del día. Actividad actual: ${model.current.title}, de ${formatClock(model.current.startMin)} a ${formatClock(model.current.endMin)}.`
  const energies = [...new Set(layout.nodes.filter((n) => n.node.role === 'major').map((n) => n.node.energy))]
  const inspecting = Boolean(selected)
  const released = reached(stage, 'dematerialize')
  const gone = released && reduced

  /** Presence of a secondary node for the current stage. */
  const presenceOf = (p: PlacedNode) => {
    const { opacity } = look(p)
    if (stage === 'organize') return opacity * 0.85
    if (reduced && released) return 0
    if (reading(stage)) return opacity * (reduced ? 0.75 : 0.92)
    return opacity
  }
  const transitionOf = (i: number): Transition => {
    if (stage === 'organize') return tr(1.8, 0.05 * (i % 7))
    if (stage === 'field') return tr(0.9)
    if (reduced && released) return tr(0.8)
    return tr(1.4)
  }

  // Selected node on top.
  const ordered = [...layout.nodes.filter((n) => n !== current)].sort(
    (a, b) => Number(a.node.id === selected) - Number(b.node.id === selected),
  )

  return (
    <m.div
      className="day-field absolute inset-0"
      data-inspecting={inspecting || undefined}
      initial={{ opacity: 1 }}
      animate={{ opacity: reduced && stage === 'handoff' ? 0 : 1 }}
      transition={tr(0.5)}
      onClick={close}
    >
      <p className="sr-only" role="status">
        {summary}
      </p>

      {/* Light: an irregular Astral Fade for every form. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {layout.nodes.map((p, i) => {
          const isCurrent = p === current
          const l = look(p)
          const releaseAt = isCurrent ? CURRENT_RELEASE_MS + 400 : releaseDelay(p)
          return (
            <AstralFade
              key={p.node.id}
              placed={p}
              radius={p.r * l.scale}
              presence={
                stage === 'organize'
                  ? 0.4
                  : (isCurrent ? 1 : l.opacity * FADE_WEIGHT[p.node.role]) * (isCurrent && reading(stage) ? 1 : 0.85)
              }
              released={(released && !isCurrent) || (reduced && released) || (isCurrent && reached(stage, 'gather'))}
              selected={selected === p.node.id}
              isCurrent={isCurrent}
              index={i}
              transition={
                released
                  ? tr(isCurrent ? 0.8 : 1, reduced ? 0 : releaseAt / 1000)
                  : stage === 'organize'
                    ? tr(1.8, 0.2)
                    : tr(1.2)
              }
            />
          )
        })}
      </div>

      <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 overflow-visible">
        <defs>
          <Glow id="df-glow" color="var(--df-space)" stops={[0.2, 0.08, 0]} />
          {energies.map((e) => (
            <Glow key={e} id={`df-halo-${e}`} color={PRESETS[e].accent} stops={[0.14, 0.05, 0]} />
          ))}
          {/* Depth: a light, static softening for what is far from now. */}
          {[0.45, 0.8].map((d, i) => (
            <filter key={d} id={`df-blur-${i + 1}`} x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation={d} />
            </filter>
          ))}
        </defs>

        <g className="df-dim">
          {layout.glows.map((g) => (
            <m.circle
              key={g.id}
              cx={g.x}
              cy={g.y}
              r={g.r}
              fill="url(#df-glow)"
              initial={{ opacity: 0 }}
              animate={{ opacity: released || stage === 'organize' ? 0 : g.side === 'past' ? 0.7 : 1 }}
              transition={released ? tr(0.6) : tr(1, 0.1)}
            />
          ))}

          <g fill="none" strokeLinecap="round">
            {layout.fragments.map((f) => {
              const mid = f.samples[Math.floor(f.samples.length / 2)] ?? layout.anchor
              return <TrailPath key={f.id} trail={f} stage={stage} reduced={reduced} tr={tr} unit={layout.unit} delay={releaseDelay(mid)} />
            })}
          </g>

          <g>
            {layout.points.map((p, i) => (
              <Point key={p.id} point={p} index={i} stage={stage} reduced={reduced} origin={origins.get(p.id)} tr={tr} delay={releaseDelay(p)} />
            ))}
          </g>
        </g>

        {/* Major blocks keep a trace of their energy in the halo. */}
        <g className="df-dim">
          {layout.nodes
            .filter((n) => n.node.role === 'major' && n !== current)
            .map((n) => (
              <m.circle
                key={n.node.id}
                cx={n.x}
                cy={n.y}
                r={n.r * look(n).scale * 2.4}
                fill={`url(#df-halo-${n.node.energy})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: released || stage === 'organize' ? 0 : look(n).opacity }}
                transition={released ? tr(0.8, releaseDelay(n) / 1000) : tr(1.2, 0.3)}
              />
            ))}
        </g>

        {ordered.map((p) => (
          <FormNode
            key={p.node.id}
            placed={p}
            rec={recs.get(p.node.id)!}
            look={look(p)}
            color={COLOR[p.depth.side === 'past' ? 'past' : 'future']}
            presence={presenceOf(p)}
            transition={transitionOf(layout.nodes.indexOf(p))}
            origin={origins.get(p.node.id)}
            pull={reading(stage) && !reduced ? p.pull : { x: 0, y: 0 }}
            selected={selected === p.node.id}
            alive={!reduced && !released}
            index={layout.nodes.indexOf(p)}
            reduced={reduced}
          />
        ))}

        <CurrentForm
          layout={layout}
          rec={recs.get(currentId)!}
          stage={stage}
          reduced={reduced}
          origin={origins.get(currentId)}
          selected={selected === currentId}
          tr={tr}
        />
      </svg>

      {!reduced && (
        <ParticleCanvas
          width={width}
          height={height}
          particles={particles}
          gathering={gathering}
          clock={clock}
          running={released && stage !== 'handoff'}
        />
      )}

      {/* Names: the present, at most one behind and one ahead, the day's limits at first. */}
      <div aria-hidden className="df-dim pointer-events-none absolute inset-0">
        <Spot spot={layout.labels.current} layout={layout}>
          <m.span
            className="label-spaced block text-accent"
            style={{ fontSize: 10 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: reached(stage, 'field') && !released ? 1 : 0 }}
            transition={released ? tr(0.4, 0.8) : tr(0.6, 0.35)}
          >
            Ahora
          </m.span>
          <m.span
            className="label-spaced mt-[9px] block text-ink text-balance"
            style={{ fontSize: 12, lineHeight: 1.45, maxWidth: layout.portrait ? 170 : 240 }}
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={
              reached(stage, 'present') && !reached(stage, 'gather') && !gone
                ? { opacity: 1, filter: 'blur(0px)' }
                : { opacity: 0, filter: 'blur(4px)' }
            }
            transition={reached(stage, 'gather') ? tr(0.4, 0.5) : tr(0.6)}
          >
            {model.current.name}
          </m.span>
          <m.span
            className="tabular mt-[7px] block text-[12px] text-ink-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: reached(stage, 'present') && !released ? 1 : 0 }}
            transition={released ? tr(0.4, 0.8) : tr(0.6, 0.15)}
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
                animate={{ opacity: reading(stage) ? (entry.node.node.temporal === 'past' ? 0.75 : 0.85) : 0 }}
                transition={reached(stage, 'settle') ? tr(0.5) : tr(0.7, 0.3)}
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
                animate={{ opacity: stage === 'field' ? 1 : stage === 'present' ? 0.8 : stage === 'explore' ? 0.3 : 0 }}
                transition={stage === 'explore' ? tr(1.6, 1) : tr(0.6, 0.3)}
              >
                {a.text}
              </m.span>
            </Spot>
          ) : null,
        )}

        {/* The module the present leaves behind takes the name AHORA. */}
        {reached(stage, 'gather') && stage !== 'handoff' && (
          <m.div
            className="absolute flex"
            style={{ left: layout.anchor.x + 9 * scale + 12, top: layout.anchor.y - 5.5 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={tr(0.4, reduced ? 0.1 : 0.9)}
          >
            <Label className="text-ink-2">Ahora</Label>
          </m.div>
        )}
        {reduced && reached(stage, 'gather') && (
          <m.div
            className="absolute text-ink-3"
            style={{ left: layout.anchor.x - 9, top: layout.anchor.y - 9, width: 18, height: 18, scale }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={tr(0.4)}
          >
            <ActiveMatrix />
          </m.div>
        )}
        {!reduced && stage === 'handoff' && <Handoff layout={layout} landsOnMatrix={landsOnMatrix} tr={tr} />}
      </div>

      {/* Inspection: every node can be touched while the field is open. */}
      {open(stage) && (
        <div className="absolute inset-0">
          {layout.nodes.map((p) => (
            <button
              key={p.node.id}
              type="button"
              aria-label={`${p.node.title}, ${formatRange(p.node.startMin, p.node.endMin)}, ${stateLabel(p.node)}`}
              aria-pressed={selected === p.node.id}
              className="absolute rounded-full"
              style={{ left: p.x - p.hit, top: p.y - p.hit, width: p.hit * 2, height: p.hit * 2 }}
              onClick={(e) => {
                e.stopPropagation()
                select(p.node.id)
              }}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && open(stage) && (
          <MicroCard key={selected} placed={layout.nodes.find((n) => n.node.id === selected)!} width={width} height={height} />
        )}
      </AnimatePresence>

    </m.div>
  )
})

/* ------------------------------------------------------------------------ */
/* Pieces                                                                    */
/* ------------------------------------------------------------------------ */

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

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

/** A piece of the day's trajectory; it erodes from its ends into matter. */
function TrailPath({
  trail: f,
  stage,
  reduced,
  tr,
  unit,
  delay,
}: {
  trail: Trail
  stage: FieldStage
  reduced: boolean
  tr: Tr
  unit: number
  delay: number
}) {
  const base = f.current ? (f.side === 'past' ? 0.5 : 0.42) : f.side === 'past' ? 0.38 - 0.22 * f.f : 0.34 - 0.16 * f.f
  const shown = reached(stage, 'field')
  const released = reached(stage, 'dematerialize')
  const opacity = shown ? base * (reading(stage) && !f.current ? 0.85 : 1) : 0
  return (
    <m.path
      d={f.d}
      strokeWidth={(f.major ? 1 : 0.85) * unit}
      style={{ stroke: f.side === 'past' ? 'var(--df-path)' : 'var(--df-line-future)' }}
      initial={{ pathLength: reduced ? 1 : 0, pathOffset: 0, opacity: 0 }}
      animate={
        released
          ? reduced
            ? { opacity: 0 }
            : { pathLength: 0, pathOffset: 0.5, opacity: 0 }
          : { pathLength: shown || reduced ? 1 : 0, pathOffset: 0, opacity }
      }
      transition={
        released
          ? { ...tr(0.7, delay / 1000), opacity: tr(0.25, delay / 1000 + 0.55) }
          : { pathLength: tr(1.1, 0.05), opacity: tr(0.7) }
      }
    />
  )
}

/** Loose points of concentration; they become matter where they are. */
function Point({
  point: p,
  index,
  stage,
  reduced,
  origin,
  tr,
  delay,
}: {
  point: MicroPoint
  index: number
  stage: FieldStage
  reduced: boolean
  origin?: Pt & { o: number }
  tr: Tr
  delay: number
}) {
  const depth = p.side === 'past' ? 1 - 0.6 * p.f : p.side === 'future' ? 0.85 - 0.3 * p.f : 0.9
  const o = p.o * depth
  let pose = { cx: p.x, cy: p.y, r: p.r, opacity: o }
  let transition = tr(1.7, 0.1 + ((index * 37) % 11) * 0.04)
  if (stage === 'organize') pose.opacity = o * 0.8
  else if (stage === 'field') transition = tr(0.8)
  else if (reading(stage)) {
    if (!reduced) pose = { ...pose, cx: p.x + p.pull.x, cy: p.y + p.pull.y }
    pose.opacity = o * (reduced ? 0.6 : 0.9)
    transition = tr(1.4)
  } else if (reached(stage, 'dematerialize')) {
    // Handed to the particle field at the same place and moment.
    pose.opacity = 0
    transition = reduced ? tr(0.8) : { ...tr(0.12, delay / 1000), ease: 'linear' }
  }
  return (
    <m.circle
      initial={{ cx: origin?.x ?? p.x, cy: origin?.y ?? p.y, r: p.r * 0.8, opacity: origin?.o ?? 0 }}
      animate={pose}
      transition={transition}
      style={{ fill: POINT_COLOR[p.side] }}
    />
  )
}

/**
 * The present: the most alive element of the field. It travels through the
 * five configurations, ends as Dissolving, comes apart last, and its modular
 * core (core + four satellites) grows into the AHORA module.
 */
function CurrentForm({
  layout,
  rec,
  stage,
  reduced,
  origin,
  selected,
  tr,
}: {
  layout: DayFieldLayout
  rec: NodeRec
  stage: FieldStage
  reduced: boolean
  origin?: Pt & { o: number }
  selected: boolean
  tr: Tr
}) {
  const { anchor, unit, module } = layout
  const node = layout.current.node
  const gathering = reached(stage, 'gather')
  const hidden = reduced ? gathering : stage === 'handoff'
  const coreR = gathering ? 2.2 * module.scale : (stage === 'organize' ? 2.4 : 3) * unit
  const satellite = (s: Pt) =>
    gathering
      ? { cx: s.x * module.pitch, cy: s.y * module.pitch, r: 1.25 * module.scale, opacity: 0.6 }
      : { cx: s.x * (coreR + 3.4 * unit), cy: s.y * (coreR + 3.4 * unit), r: 0.8 * unit, opacity: reached(stage, 'field') ? 0.55 : 0 }
  return (
    <m.g
      initial={{ x: origin?.x ?? anchor.x, y: origin?.y ?? anchor.y, opacity: reduced ? 0 : (origin?.o ?? 0) }}
      animate={{ x: anchor.x, y: anchor.y, opacity: hidden ? 0 : 1 }}
      transition={hidden && !reduced ? { duration: 0 } : tr(stage === 'organize' ? 1.8 : 0.8)}
    >
      <m.g initial={false} animate={{ scale: selected ? 1.1 : 1 }} transition={{ duration: 0.6, ease: ORGANIC }}>
        {SHAPES[rec.to].map((_, i) => (
          <FragmentPath key={i} rec={rec} i={i} radius={layout.current.r} color={COLOR.current} width={1.1} />
        ))}
        {reading(stage) && !reduced && (
          <circle
            className="matrix-pulse"
            r={coreR}
            style={{ fill: 'var(--df-now-core)', animationDuration: `${PULSE_S[node.energy]}s` }}
          />
        )}
        {SATELLITES.map((s, i) => (
          <m.circle
            key={i}
            initial={false}
            animate={satellite(s)}
            transition={gathering ? tr(1.1, 0.15) : tr(0.9)}
            style={{ fill: gathering ? 'var(--ink-3)' : 'var(--df-now-core)', transition: 'fill 1s ease' }}
          />
        ))}
        <m.circle
          initial={{ r: 2 * unit }}
          animate={{ r: coreR }}
          transition={gathering ? tr(1.1, 0.15) : tr(0.9)}
          style={{ fill: gathering ? 'var(--accent)' : 'var(--df-now-core)', transition: 'fill 1.1s ease' }}
        />
      </m.g>
    </m.g>
  )
}

/**
 * AHORA → HOY. The module and its name land exactly on HOY's AHORA marker
 * while HOY materializes underneath.
 */
function Handoff({ layout, landsOnMatrix, tr }: { layout: DayFieldLayout; landsOnMatrix: boolean; tr: Tr }) {
  const { anchor, module } = layout
  const [target, setTarget] = useState<{ matrix: DOMRect; label: DOMRect } | null>(null)

  useLayoutEffect(() => {
    let frame = 0
    const find = () => {
      const matrix = document.querySelector('[data-now-matrix]')
      const label = document.querySelector('[data-now-label]')
      if (matrix && label) setTarget({ matrix: matrix.getBoundingClientRect(), label: label.getBoundingClientRect() })
      else frame = requestAnimationFrame(find)
    }
    find()
    return () => cancelAnimationFrame(frame)
  }, [])

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
        initial={{ x: 0, y: 0, opacity: 1 }}
        animate={target ? { x: target.label.left - labelLeft, y: target.label.top - labelTop, opacity: 1 } : { x: 0, y: 0, opacity: 1 }}
        transition={tr(0.62)}
      >
        <Label className="text-ink-2">Ahora</Label>
      </m.div>
    </>
  )
}
