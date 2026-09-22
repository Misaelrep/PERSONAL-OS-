import { AnimatePresence, m } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EntryGlyph } from '../../components/dot/EntryGlyph'
import { Button } from '../../components/ui/Button'
import { Label } from '../../components/ui/Label'
import type { DailyMessage } from '../../data/dailyMessages'
import { ENERGY_QUESTION } from '../../domain/energy'
import { formatClock, formatRange } from '../../domain/time'
import { EASE } from '../../motion/tokens'
import { useDay } from '../../state/DayProvider'

/**
 * DAILY ENTRY — the first real open of the day.
 *
 * CAMPO ATMOSFÉRICO → MENSAJE DEL DÍA → DISOLUCIÓN → PUNTOS SE ORGANIZAN →
 * ¿LISTO PARA [ESTADO]? → actividad actual → ENTRAR → (HOY se materializa)
 */
export type EntryStage = 'field' | 'message' | 'dissolve' | 'organize' | 'leaving'

const FIELD_MS = 1300
const DISSOLVE_MS = 900
const LEAVE_MS = 650

/** Time to read the message, scaled to its length. */
function readingMs(message: DailyMessage): number {
  const chars = message.lines.join(' ').length
  return Math.min(Math.max(3000 + chars * 25, 3500), 6500)
}

interface DailyEntryProps {
  message: DailyMessage
  onStage: (stage: EntryStage) => void
  onEnter: () => void
}

export function DailyEntry({ message, onStage, onEnter }: DailyEntryProps) {
  const { view, now } = useDay()
  const [stage, setStage] = useState<EntryStage>('field')
  const timers = useRef<number[]>([])

  const go = useCallback(
    (next: EntryStage) => {
      setStage(next)
      onStage(next)
    },
    [onStage],
  )

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }

  const dissolveThenOrganize = useCallback(() => {
    clear()
    go('dissolve')
    timers.current.push(window.setTimeout(() => go('organize'), DISSOLVE_MS))
  }, [go])

  useEffect(() => {
    timers.current.push(window.setTimeout(() => go('message'), FIELD_MS))
    timers.current.push(window.setTimeout(dissolveThenOrganize, FIELD_MS + readingMs(message)))
    return clear
  }, [go, dissolveThenOrganize, message])

  const enter = () => {
    if (stage === 'leaving') return
    clear()
    go('leaving')
    timers.current.push(window.setTimeout(onEnter, LEAVE_MS))
  }

  // Tapping while the message is up moves the ritual along; it never skips ENTRAR.
  const advance = () => {
    if (stage === 'field' || stage === 'message') dissolveThenOrganize()
  }

  // Keyboard: Enter / Space advances the message, then enters.
  const keyRef = useRef({ stage, advance, enter })
  keyRef.current = { stage, advance, enter }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const { stage: current, advance: next, enter: go } = keyRef.current
      if (current === 'organize') {
        if (!(e.target instanceof HTMLButtonElement)) {
          e.preventDefault()
          go()
        }
      } else {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const block = view.current
  const weekday = now.toLocaleDateString('es', { weekday: 'long' })
  const date = now.toLocaleDateString('es', { day: 'numeric', month: 'long' })
  const question = block.kind === 'sleep' ? '¿Listo para descansar?' : ENERGY_QUESTION[view.energy]
  const range = block.kind === 'sleep' ? `hasta ${formatClock(block.endMin)}` : formatRange(block.startMin, block.endMin)
  const ready = stage === 'organize'

  return (
    <m.div
      role="dialog"
      aria-label="Entrada del día"
      className="tone-ink fixed inset-0 z-30 grid place-items-center px-6 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),24px)]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      onClick={advance}
    >
      <AnimatePresence mode="wait">
        {(stage === 'message' || stage === 'dissolve') && (
          <m.div
            key="message"
            aria-live="polite"
            className="w-full max-w-[34rem] text-center"
            initial={{ opacity: 0 }}
            animate={
              stage === 'dissolve'
                ? { opacity: 0, filter: 'blur(10px)', letterSpacing: '0.06em', y: -6 }
                : { opacity: 1, filter: 'blur(0px)', letterSpacing: '0em', y: 0 }
            }
            transition={{ duration: stage === 'dissolve' ? DISSOLVE_MS / 1000 : 0.6, ease: EASE }}
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
                  transition={{ duration: 0.9, ease: EASE, delay: 0.25 + i * 0.55 }}
                >
                  {line}
                </m.span>
              ))}
            </p>
          </m.div>
        )}

        {(stage === 'organize' || stage === 'leaving') && (
          <m.div
            key="ready"
            className="flex w-full max-w-[30rem] flex-col items-center text-center sm:max-w-[46rem]"
            initial={{ opacity: 1 }}
            animate={stage === 'leaving' ? { opacity: 0, scale: 0.97, filter: 'blur(6px)' } : { opacity: 1, scale: 1 }}
            transition={{ duration: LEAVE_MS / 1000, ease: EASE }}
          >
            <EntryGlyph energy={view.energy} organized={ready || stage === 'leaving'} />
            <m.h1
              className="mt-10 font-display text-[clamp(30px,6vw,46px)] leading-[1.05] font-normal tracking-[-0.038em] text-ink"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.95 }}
            >
              {question}
            </m.h1>
            <m.p
              className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, ease: EASE, delay: 1.3 }}
            >
              <Label className="text-ink-2">{block.title}</Label>
              <span className="tabular text-[14px] text-ink-3">{range}</span>
            </m.p>
            <m.div
              className="mt-12"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 1.65 }}
            >
              <Button onClick={enter} className="min-w-44">
                Entrar
              </Button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}
