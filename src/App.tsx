import { AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Atmosphere } from './atmosphere/Atmosphere'
import { DailyEntry, isFieldStage, type EntryStage } from './features/entry/DailyEntry'
import { MicroEntry } from './features/entry/MicroEntry'
import { useEntry } from './features/entry/useEntry'
import { FocusClosing } from './features/focus/FocusClosing'
import { FocusIntro } from './features/focus/FocusIntro'
import { FocusView } from './features/focus/FocusView'
import { useFocusFlow } from './features/focus/useFocusFlow'
import { TodayView, type TodayAppear } from './features/today/TodayView'
import { NavRail } from './layout/NavRail'
import { useMotion } from './motion/MotionLevel'
import { useDay } from './state/DayProvider'

export function App() {
  const { view, state } = useDay()
  const flow = useFocusFlow()
  const { phase, step } = flow
  const { level } = useMotion()
  const entry = useEntry(Boolean(state.focus))
  const [entryStage, setEntryStage] = useState<EntryStage>('atmosphere')
  // The DAY FIELD asks for HOY underneath before the entry ends, so it can land on AHORA.
  const [handoff, setHandoff] = useState(false)
  // HOY's first appearance after an entry: materialized (micro) or in order from AHORA (full).
  const [appear, setAppear] = useState<TodayAppear>(
    entry.kind === 'full' ? (level === 'reducido' ? 'fade' : 'field') : entry.kind === 'micro' ? 'materialize' : 'fade',
  )
  useEffect(() => {
    if (phase !== 'today') setAppear('fade')
  }, [phase])

  const focusBlock = view.timeline.find((b) => b.id === (state.focus?.blockId ?? flow.closedBlockId))
  const showToday = (!entry.active || handoff) && (phase === 'today' || phase === 'entering')
  // The entry's floating points become the DAY FIELD's first nodes; they return once HOY is back.
  const particles = entry.active
    ? isFieldStage(entryStage)
      ? 'handed-off'
      : 'dispersed'
    : flow.atmosphere.particles
  const showFocus = focusBlock && ((phase === 'entering' && step >= 5) || phase === 'focus' || phase === 'exiting')
  const showClosing = focusBlock && (phase === 'result' || phase === 'next')

  return (
    <>
      <Atmosphere
        {...flow.atmosphere}
        particles={particles}
        scene={phase === 'today' || (phase === 'entering' && step < 3) ? 'today' : 'flow'}
        gather={phase === 'entering' && step >= 2}
      />
      <NavRail hidden={entry.active || !(phase === 'today' || (phase === 'entering' && step < 2))} />

      <AnimatePresence>
        {entry.active && entry.kind === 'full' && (
          <DailyEntry
            key="daily"
            message={entry.message}
            onStage={setEntryStage}
            onHandoff={() => setHandoff(true)}
            onDone={entry.complete}
          />
        )}
        {entry.active && entry.kind === 'micro' && <MicroEntry key="micro" onDone={entry.complete} />}
      </AnimatePresence>

      {showToday && (
        <TodayView step={phase === 'entering' ? step : 0} onStartFocus={flow.start} appear={appear} />
      )}

      <AnimatePresence>
        {phase === 'entering' && step >= 4 && <FocusIntro key="intro" dissolving={step >= 5} />}
      </AnimatePresence>

      <AnimatePresence>
        {showFocus && (
          <FocusView
            key="focus"
            block={focusBlock}
            closing={phase === 'exiting'}
            onFinish={flow.finish}
            onLeave={flow.leave}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showClosing && (
          <FocusClosing
            key="closing"
            phase={phase}
            block={focusBlock}
            onAnswer={flow.answer}
            onDone={flow.backToToday}
          />
        )}
      </AnimatePresence>
    </>
  )
}
