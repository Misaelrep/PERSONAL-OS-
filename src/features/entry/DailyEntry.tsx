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
 * ATMÓSFERA VIVA → MENSAJE → EL MENSAJE SE DISUELVE → DAY FIELD (≥ 15 s, alive
 * and inspectable) → ESTABILIZACIÓN → LAS FORMAS SE DESMATERIALIZAN →
 * PARTÍCULAS → CONVERGEN EN AHORA → HOY SE MATERIALIZA. No buttons besides a
 * quiet CONTINUAR late in the field.
 */
export type EntryStage = 'atmosphere' | 'message' | 'dissolve' | FieldStage

const SEQUENCE: EntryStage[] = ['atmosphere', 'message', 'dissolve', ...FIELD_STAGES]

export const isFieldStage = (stage: EntryStage): stage is FieldStage => (FIELD_STAGES as EntryStage[]).includes(stage)

/** Time each stage lasts (ms). `message` depends on the text. */
const STAGE_MS: Record<Exclude<EntryStage, 'message'>, number> = {
  atmosphere: 1300,
  dissolve: 500,
  organize: 2000,
  field: 2000,
  present: 2000,
  explore: 9000,
  settle: 1500,
  dematerialize: 2000,
  particles: 1500,
  gather: 1500,
  handoff: 1000,
}

/** Reduced motion: static variety, crossfades. Zero-length stages are skipped. */
const REDUCED_MS: typeof STAGE_MS = {
  atmosphere: 900,
  dissolve: 450,
  organize: 0,
  field: 1500,
  present: 1500,
  explore: 9000,
  settle: 500,
  dematerialize: 900,
  particles: 0,
  gather: 800,
  handoff: 800,
}

/** ?field=collapse: straight to the exit, at normal speed. */
const COLLAPSE_EXPLORE_MS = 1200
const COLLAPSE_READING_MS = 1500

/** CONTINUAR appears, quietly, this long after the field began (ms). */
const CONTINUE_AT_MS = 12000

/** After an inspection closes, the field waits this long before it leaves (ms). */
const AFTER_INSPECTION_MS = 2000

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
  const continueTimer = useRef(0)
  const exitTimer = useRef(0)
  const callbacks = useRef({ onStage, onHandoff, onDone })
  callbacks.current = { onStage, onHandoff, onDone }
  const [showContinue, setShowContinue] = useState(false)
  const inspecting = useRef(false)
  const exitPending = useRef(false)

  const durationOf = useCallback(
    (s: EntryStage) => {
      if (s === 'message') return (mode.collapse ? COLLAPSE_READING_MS : readingMs(message)) * speed
      if (s === 'explore' && mode.collapse) return COLLAPSE_EXPLORE_MS * speed
      return (reduced ? REDUCED_MS : STAGE_MS)[s] * speed
    },
    [message, reduced, speed, mode.collapse],
  )

  const go = useCallback(
    (target: EntryStage) => {
      window.clearTimeout(timer.current)
      window.clearTimeout(exitTimer.current)
      let next = target
      while (next !== 'handoff' && durationOf(next) === 0) next = SEQUENCE[SEQUENCE.indexOf(next) + 1]
      setStage(next)
      callbacks.current.onStage(next)
      if ((next === 'organize' || next === 'field') && !continueTimer.current)
        continueTimer.current = window.setTimeout(() => setShowContinue(true), CONTINUE_AT_MS * speed)
      if (next === 'handoff') callbacks.current.onHandoff()
      const after = SEQUENCE[SEQUENCE.indexOf(next) + 1]
      if (next === 'explore') {
        // ?field=hold keeps the field alive; otherwise it leaves on its own,
        // but never while something is being inspected.
        if (mode.hold) return
        timer.current = window.setTimeout(() => {
          if (inspecting.current) exitPending.current = true
          else go('settle')
        }, durationOf(next))
        return
      }
      timer.current = window.setTimeout(() => (after ? go(after) : callbacks.current.onDone()), durationOf(next))
    },
    [durationOf, mode.hold, speed],
  )

  // Starts once; later changes (e.g. the motion level) don't restart the ritual.
  const start = useRef(go)
  useEffect(() => {
    start.current('atmosphere')
    return () => {
      window.clearTimeout(timer.current)
      window.clearTimeout(continueTimer.current)
      window.clearTimeout(exitTimer.current)
    }
  }, [])

  const onInspect = useCallback(
    (open: boolean) => {
      inspecting.current = open
      window.clearTimeout(exitTimer.current)
      if (!open && exitPending.current) {
        exitPending.current = false
        exitTimer.current = window.setTimeout(() => {
          if (inspecting.current) exitPending.current = true
          else go('settle')
        }, AFTER_INSPECTION_MS * speed)
      }
    },
    [go, speed],
  )
  const onContinue = useCallback(() => {
    inspecting.current = false
    exitPending.current = false
    go('settle')
  }, [go])

  // A tap during the message moves the ritual along; in the field, taps inspect.
  const stageRef = useRef(stage)
  stageRef.current = stage
  const advance = useCallback(() => {
    const s = stageRef.current
    if (s === 'atmosphere' || s === 'message') go('dissolve')
  }, [go])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const s = stageRef.current
      if (s !== 'atmosphere' && s !== 'message') return
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
          hold={mode.hold}
          onInspect={onInspect}
        />
      )}

      {/* Late in the field, a quiet way on. It never skips the transition. */}
      <AnimatePresence>
        {showContinue && stage === 'explore' && (
          <m.div
            key="continue"
            className="pointer-events-none absolute inset-x-0 flex justify-center"
            style={{ bottom: 'max(env(safe-area-inset-bottom), 26px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: EASE }}
          >
            <button
              type="button"
              className="label-spaced pointer-events-auto px-4 py-3 text-ink-3 opacity-70 transition-opacity duration-300 hover:opacity-100"
              style={{ fontSize: 10 }}
              onClick={(e) => {
                e.stopPropagation()
                onContinue()
              }}
            >
              Continuar <span aria-hidden>→</span>
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}
