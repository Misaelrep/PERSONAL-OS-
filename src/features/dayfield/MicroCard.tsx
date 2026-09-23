import { m } from 'framer-motion'
import { formatClock, formatRange } from '../../domain/time'
import { EASE } from '../../motion/tokens'
import type { PlacedNode } from './geometry'
import type { FieldNode } from './model'

/** Inspection only: what the block is and where it stands. No actions. */
export function stateLabel(node: FieldNode): string {
  if (node.temporal === 'current') return 'Ahora'
  if (node.execution === 'completed') return 'Completado'
  if (node.execution === 'partial') return 'Parcial'
  if (node.execution === 'skipped') return 'Omitido'
  return node.temporal === 'past' ? 'Sin registrar' : 'Próximo'
}

export function MicroCard({ placed, width, height }: { placed: PlacedNode; width: number; height: number }) {
  const n = placed.node
  const cardWidth = Math.min(236, width - 32)
  const cardHeight = 96 + (n.objective ? 48 : 0) + (n.pending ? 48 : 0)
  const gap = placed.hit + 6
  const top0 = 56
  const clampTop = (y: number) => Math.min(Math.max(y, top0), height - 16 - cardHeight)

  let left: number
  let top: number
  if (placed.x + gap + cardWidth < width - 12) {
    left = placed.x + gap
    top = clampTop(placed.y - cardHeight / 2)
  } else if (placed.x - gap - cardWidth > 12) {
    left = placed.x - gap - cardWidth
    top = clampTop(placed.y - cardHeight / 2)
  } else {
    left = Math.min(Math.max(placed.x - cardWidth / 2, 16), width - 16 - cardWidth)
    top = placed.y + gap + cardHeight < height - 16 ? placed.y + gap : clampTop(placed.y - gap - cardHeight)
  }

  const range = n.kind === 'sleep' && n.temporal === 'current' ? `hasta ${formatClock(n.endMin)}` : formatRange(n.startMin, n.endMin)

  return (
    <m.div
      role="dialog"
      aria-label={`${n.title}, ${range}`}
      className="surface-quiet pointer-events-auto absolute rounded-[18px] px-4 pt-3.5 pb-4 text-left"
      style={{ left, top, width: cardWidth }}
      initial={{ opacity: 0, y: 4, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
      exit={{ opacity: 0, filter: 'blur(4px)', transition: { duration: 0.25 } }}
      transition={{ duration: 0.45, ease: EASE }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="font-display text-[17px] leading-tight tracking-[-0.02em] text-ink">{n.title}</p>
      <p className="tabular mt-1.5 text-[13px] text-ink-2">{range}</p>
      <p className="mt-1 text-[13px] text-ink-3">
        {n.kindLabel} <span className="text-ink-4">·</span> {stateLabel(n)}
      </p>
      {n.objective && (
        <div className="mt-3">
          <span className="label-spaced block text-ink-4" style={{ fontSize: 9.5 }}>
            Objetivo
          </span>
          <p className="mt-1.5 text-[14px] leading-snug text-ink-2">{n.objective}</p>
        </div>
      )}
      {n.pending && (
        <div className="mt-3">
          <span className="label-spaced block text-ink-4" style={{ fontSize: 9.5 }}>
            Pendiente
          </span>
          <p className="mt-1.5 text-[14px] leading-snug text-ink-2">{n.pending}</p>
        </div>
      )}
    </m.div>
  )
}
