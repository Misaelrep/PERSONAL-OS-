import { m } from 'framer-motion'
import { useMemo } from 'react'
import type { EnergyState } from '../../domain/types'
import { useMotion } from '../../motion/MotionLevel'
import { EASE } from '../../motion/tokens'
import { ENERGY_CONFIG } from './EnergyGlyph'

/**
 * PUNTOS SE ORGANIZAN — a faint 8 × 8 matrix appears and five points arrive
 * from far away to settle into the energy state's configuration (the same
 * shape the HOY chip shows).
 */
const GRID = Array.from({ length: 64 }, (_, i) => ({ x: 1 + (i % 8) * 2, y: 1 + Math.floor(i / 8) * 2 }))

function seeded(i: number) {
  const x = Math.sin(i * 91.3458 + 17.23) * 47453.5453
  return x - Math.floor(x)
}

export function EntryGlyph({ energy, organized }: { energy: EnergyState; organized: boolean }) {
  const { cinematic } = useMotion()
  const scatter = useMemo(
    () => ENERGY_CONFIG[energy].map((_, i) => ({ x: (seeded(i) - 0.5) * 70, y: (seeded(i + 7) - 0.5) * 90 })),
    [energy],
  )
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-[104px] overflow-visible sm:size-[128px]">
      {GRID.map((g, i) => (
        <m.circle
          key={`g${i}`}
          cx={g.x}
          cy={g.y}
          r={0.26}
          className="fill-[var(--ink-4)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: organized ? 0.55 : 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: organized ? 0.25 + seeded(i + 30) * 0.4 : 0 }}
        />
      ))}
      {ENERGY_CONFIG[energy].map((d, i) => (
        <m.circle
          key={i}
          fill="var(--accent)"
          initial={
            cinematic
              ? { cx: d.x + scatter[i].x, cy: d.y + scatter[i].y, r: d.r * 0.5, opacity: 0 }
              : { cx: d.x, cy: d.y, r: d.r * 0.72, opacity: 0 }
          }
          animate={
            organized
              ? { cx: d.x, cy: d.y, r: d.r * 0.72, opacity: Math.max(d.o, 0) }
              : undefined
          }
          transition={{ duration: 1.25, ease: EASE, delay: i * 0.07 }}
        />
      ))}
    </svg>
  )
}
