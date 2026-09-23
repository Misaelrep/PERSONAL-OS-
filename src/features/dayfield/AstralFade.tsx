import { m, type Transition } from 'framer-motion'
import type { PlacedNode } from './geometry'

/**
 * ASTRAL FADE per node: an irregular field of light (pearl, silver, ice blue
 * and an almost invisible violet) made of a few elliptical glows that are born,
 * drift, expand, lose definition and return, each on its own slow cycle.
 * HTML with CSS animations only (transform / opacity), so it stays on the
 * compositor.
 */
interface AstralFadeProps {
  placed: PlacedNode
  /** Visual radius of the form (after depth). */
  radius: number
  presence: number
  /** Expands and dissolves with its form. */
  released: boolean
  selected: boolean
  isCurrent: boolean
  transition: Transition
  index: number
}

export function AstralFade({ placed, radius, presence, released, selected, isCurrent, transition, index }: AstralFadeProps) {
  const r = Math.max(radius, 5)
  const { role } = placed.node
  // Light is spent where it matters: the present and the major blocks breathe;
  // medium ones keep one slow glow; micro ones a still one.
  const layers = isCurrent ? 3 : role === 'major' ? 2 : 1
  const still = role === 'micro'
  const cycle = (base: number, k: number) => ({
    animationDuration: `${base + ((index * k) % 7)}s`,
    animationDelay: `${-((index * (k + 2.3)) % 13)}s`,
  })
  return (
    <m.div
      className="df-fade"
      style={{ left: placed.x, top: placed.y }}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={
        released
          ? { opacity: 0, scale: 1.7 }
          : { opacity: presence, scale: selected ? 0.82 : isCurrent ? 1.08 : 1 }
      }
      transition={transition}
    >
      <div className="df-dim" data-selected={selected || undefined}>
        {layers === 1 ? (
          <span
            className={`df-blob df-blob-mixed${still ? ' df-still' : ''}`}
            style={{ width: r * 5, height: r * 3.9, ...cycle(13, 3) }}
          />
        ) : (
          <>
            <span className="df-blob df-blob-pearl" style={{ width: r * 5.6, height: r * 4.4, ...cycle(11, 3) }} />
            <span className="df-blob df-blob-ice" style={{ width: r * 4.6, height: r * 3.4, ...cycle(13, 5) }} />
          </>
        )}
        {layers === 3 && <span className="df-blob df-blob-violet" style={{ width: r * 6.4, height: r * 5, ...cycle(17, 4) }} />}
      </div>
    </m.div>
  )
}
