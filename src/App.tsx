import { AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Atmosphere } from './atmosphere/Atmosphere'
import { DailyEntry, type EntryStage } from './features/entry/DailyEntry'
import { MicroEntry } from './features/entry/MicroEntry'
import { useEntry } from './features/entry/useEntry'
import { FocusClosing } from './features/focus/FocusClosing'
import { FocusIntro } from './features/focus/FocusIntro'
import { FocusView } from './features/focus/FocusView'
import { useFocusFlow } from './features/focus/useFocusFlow'
import { TodayView } from './features/today/TodayView'
import { NavRail } from './layout/NavRail'
import { useDay } from './state/DayProvider'

export function App() {
  const { view, state } = useDay()
  const flow = useFocusFlow()
  const { phase, step } = flow
  const entry = useEntry(Boolean(state.focus))
  const [entryStage, setEntryStage] = useState<EntryStage>('field')
  // HOY materializes the first time it appears after an entry.
  const [materialize, setMaterialize] = useState(entry.kind !== 'none')
  useEffect(() => {
    if (phase !== 'today') setMaterialize(false)
  }, [phase])

  const focusBlock = view.timeline.find((b) => b.id === (state.focus?.blockId ?? flow.closedBlockId))
  const showToday = !entry.active && (phase === 'today' || phase === 'entering')
  // During the entry the points first stay dispersed, then gather as they organize.
  const particles = entry.active
    ? entryStage === 'organize' || entryStage === 'leaving'
      ? 'gathering'
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
          <DailyEntry key="daily" message={entry.message} onStage={setEntryStage} onEnter={entry.complete} />
        )}
        {entry.active && entry.kind === 'micro' && <MicroEntry key="micro" onDone={entry.complete} />}
      </AnimatePresence>

      {showToday && (
        <TodayView step={phase === 'entering' ? step : 0} onStartFocus={flow.start} materialize={materialize} />
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
