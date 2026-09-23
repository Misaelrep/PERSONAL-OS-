import { AnimatePresence, m } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ambientPoints } from '../../atmosphere/Particles'
import { Label } from '../../components/ui/Label'
import type { DailyMessage } from '../../data/dailyMessages'
import { minutesOfDay } from '../../domain/time'
import { useMotion } from '../../motion/MotionLevel'
import { EASE } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'
import { DayField, FIELD_STAGES, type FieldStage } from '../dayfield/DayField'
import { buildDayField } from '../dayfield/model'
import { readFieldMode } from './entryPolicy'

/**
 * DAILY ENTRY — the first real open of the day.
 *
 * ATMÓSFERA VIVA → MENSAJE → EL MENSAJE SE DISUELVE → DAY FIELD EMERGE →
 * PRESENTE EN FOCO → QUIETUD → COLAPSO → SOLO EL NODO ACTUAL → AHORA →
 * HOY SE MATERIALIZA. Automatic: no buttons. A tap only moves it along.
 */
export type EntryStage = 'atmosphere' | 'message' | 'dissolve' | FieldStage

const SEQUENCE: EntryStage[] = ['atmosphere', 'message', 'dissolve', ...FIELD_STAGES]

export const isFieldStage = (stage: EntryStage): stage is FieldStage => (FIELD_STAGES as EntryStage[]).includes(stage)

/** Time each stage lasts (ms). `message` depends on the text. */
const STAGE_MS: Record<Exclude<EntryStage, 'message'>, number> = {
  atmosphere: 1300,
  dissolve: 500,
  organize: 800,
  field: 800,
  present: 800,
  still: 900,
  collapse: 900,
  node: 450,
  handoff: 1000,
}

/** Reduced motion: crossfades only, and quicker. Zero-length stages are skipped. */
const REDUCED_MS: typeof STAGE_MS = {
  atmosphere: 900,
  dissolve: 450,
  organize: 0,
  field: 800,
  present: 800,
  still: 900,
  collapse: 0,
  node: 0,
  handoff: 700,
}

/** A tap while the field is forming only counts after this long (ms). */
const MIN_FORMING_MS = 500

/** How long the message dissolves, overlapping the field's first moments (ms). */
const DISSOLVE_MS = 900

/** Time to read the message, scaled to its length. */
function readingMs(message: DailyMessage): number {
  const chars = message.lines.join(' ').length
  return Math.min(Math.max(3000 + chars * 25, 3500), 6500)
}

interface DailyEntryProps {
  message: DailyMessage
  onStage: (stage: EntryStage) => void
  /** HOY should mount now, underneath, to materialize. */
  onHandoff: () => void
  /** The ritual is over. */
  onDone: () => void
}

export function DailyEntry({ message, onStage, onHandoff, onDone }: DailyEntryProps) {
  const { view, now } = useDay()
  const { level, particles } = useMotion()
  const reduced = level === 'reducido'
  const [mode] = useState(() => readFieldMode(window.location.search))
  const speed = mode.fast ? 0.35 : 1
  const [stage, setStage] = useState<EntryStage>('atmosphere')

  // The field is a snapshot of the day at the moment the entry began.
  const [model] = useState(() => buildDayField(view, minutesOfDay(now)))
  const [ambient] = useState(() =>
    reduced || !particles
      ? []
      : ambientPoints(window.matchMedia('(max-width: 640px)').matches).map(([x, y]) => ({
          x: (x / 100) * window.innerWidth,
          y: (y / 100) * window.innerHeight,
        })),
  )

  const timer = useRef(0)
  const formingSince = useRef(0)
  const callbacks = useRef({ onStage, onHandoff, onDone })
  callbacks.current = { onStage, onHandoff, onDone }

  const durationOf = useCallback(
    (s: EntryStage) => (s === 'message' ? readingMs(message) : (reduced ? REDUCED_MS : STAGE_MS)[s]) * speed,
    [message, reduced, speed],
  )

  const go = useCallback(
    (target: EntryStage) => {
      window.clearTimeout(timer.current)
      let next = target
      while (next !== 'handoff' && durationOf(next) === 0) next = SEQUENCE[SEQUENCE.indexOf(next) + 1]
      setStage(next)
      callbacks.current.onStage(next)
      if ((next === 'organize' || next === 'field') && !formingSince.current) formingSince.current = performance.now()
      if (next === 'handoff') callbacks.current.onHandoff()
      // ?field=hold stops while the field can be read; a tap continues.
      if (next === 'still' && mode.hold) return
      const after = SEQUENCE[SEQUENCE.indexOf(next) + 1]
      timer.current = window.setTimeout(() => (after ? go(after) : callbacks.current.onDone()), durationOf(next))
    },
    [durationOf, mode.hold],
  )

  // Starts once; later changes (e.g. the motion level) don't restart the ritual.
  const start = useRef(go)
  useEffect(() => {
    start.current('atmosphere')
    return () => window.clearTimeout(timer.current)
  }, [])

  // A tap moves the ritual along; it never skips it.
  const stageRef = useRef(stage)
  stageRef.current = stage
  const advance = useCallback(() => {
    const s = stageRef.current
    if (s === 'atmosphere' || s === 'message') go('dissolve')
    else if (s === 'organize' || s === 'field') {
      // Still forming: complete it and show the present.
      if (performance.now() - formingSince.current >= MIN_FORMING_MS * speed) go('present')
    } else if (s === 'present' || s === 'still') go('collapse')
  }, [go, speed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      advance()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance])

  const weekday = now.toLocaleDateString('es', { weekday: 'long' })
  const date = now.toLocaleDateString('es', { day: 'numeric', month: 'long' })
  const showMessage = stage === 'message' || stage === 'dissolve' || stage === 'organize'
  const dissolving = stage !== 'message'

  return (
    <m.div
      role="dialog"
      aria-label="Entrada del día"
      data-stage={stage}
      className="tone-ink fixed inset-0 z-30 grid place-items-center px-6 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),24px)]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      onClick={advance}
    >
      <AnimatePresence>
        {showMessage && (
          <m.div
            key="message"
            aria-live="polite"
            className="w-full max-w-[34rem] text-center"
            initial={{ opacity: 0 }}
            animate={
              dissolving
                ? { opacity: 0, filter: 'blur(10px)', letterSpacing: '0.06em', y: -6 }
                : { opacity: 1, filter: 'blur(0px)', letterSpacing: '0em', y: 0 }
            }
            exit={{ opacity: 0 }}
            transition={{ duration: dissolving ? (DISSOLVE_MS / 1000) * speed : 0.6, ease: EASE }}
          >
            <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, ease: EASE }}>
              <Label className="text-ink-3">
                {weekday} <span className="text-ink-4">·</span> {date}
              </Label>
            </m.div>
            <p className="mt-8 font-display text-[clamp(25px,3.6vw,38px)] leading-[1.22] font-light tracking-[-0.03em] text-balance">
              {message.lines.map((line, i) => (
                <m.span
                  key={i}
                  className={`block ${i === 0 ? 'text-ink' : 'mt-2 text-ink-2'}`}
                  initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.9 * speed, ease: EASE, delay: (0.25 + i * 0.55) * speed }}
                >
                  {line}
                </m.span>
              ))}
            </p>
          </m.div>
        )}
      </AnimatePresence>

      {isFieldStage(stage) && (
        <DayField
          model={model}
          stage={stage}
          speed={speed}
          reduced={reduced}
          ambient={ambient}
          landsOnMatrix={view.current.status === 'activo' || view.current.status === 'en-focus'}
        />
      )}
    </m.div>
  )
}
