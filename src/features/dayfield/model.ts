import type { DayView } from '../../domain/schedule'
import type { EnergyState, ScheduledBlock } from '../../domain/types'

/**
 * DAY FIELD model — the day as a temporal field, independent of drawing.
 *
 * Two axes are kept apart on purpose:
 *   temporal   past · current · future       (from the clock)
 *   execution  unregistered · completed · partial · skipped   (from stored records only)
 * A block whose time has passed is never assumed completed.
 */
export type VisualRole = 'micro' | 'medium' | 'major' | 'space' | 'endpoint'
export type TemporalSide = 'past' | 'current' | 'future'
export type Execution = 'unregistered' | 'completed' | 'partial' | 'skipped'

export interface FieldNode {
  id: string
  /** Short name for labels. */
  name: string
  title: string
  role: VisualRole
  kind: ScheduledBlock['kind']
  energy: EnergyState
  startMin: number
  endMin: number
  temporal: TemporalSide
  execution: Execution
  /** Position along the day, 0 = configured start, 1 = configured end.
   * Middle of the block; for the current block, the present moment. */
  u: number
  uStart: number
  uEnd: number
  /** Concentration the block asks for, 0–1 (drives micro-point density). */
  concentration: number
}

export interface FieldSpace {
  id: string
  startMin: number
  endMin: number
  uStart: number
  uEnd: number
}

export interface DayFieldModel {
  dayStart: number
  dayEnd: number
  /** Minutes from local midnight the field was built for. */
  now: number
  /** The present on the same 0–1 scale (below 0 before the day, above 1 after it). */
  nowU: number
  /** Everything that is drawn as a node, in time order (current included). */
  nodes: FieldNode[]
  /** Transitions and recovery gaps: drawn as open space, not as nodes. */
  spaces: FieldSpace[]
  current: FieldNode
}

const SHORT_MINUTES = 10

/** How a block is drawn. Explicit `visualRole` in the routine wins. */
export function getVisualRole(block: ScheduledBlock, meditationBlockId?: string): VisualRole {
  if (block.visualRole) return block.visualRole
  if (block.kind === 'sleep') return 'endpoint'
  if (block.kind === 'transition' || block.synthetic) return 'space'
  if (block.kind === 'deep' || block.kind === 'body') return 'major'
  if (block.kind === 'recovery') return 'medium'
  if (block.kind === 'ritual') return block.id === meditationBlockId ? 'medium' : 'micro'
  return block.endMin - block.startMin <= SHORT_MINUTES ? 'micro' : 'medium'
}

const CONCENTRATION: Record<ScheduledBlock['kind'], number> = {
  deep: 1,
  body: 0.55,
  practice: 0.3,
  ritual: 0.1,
  recovery: 0.12,
  transition: 0,
  sleep: 0,
}

/** Real, stored execution state. No record → unregistered, whatever the clock says. */
export function getExecution(block: ScheduledBlock): Execution {
  switch (block.record.status) {
    case 'completado':
      return 'completed'
    case 'parcial':
      return 'partial'
    case 'omitido':
      return 'skipped'
    default:
      return 'unregistered'
  }
}

export interface TemporalDepth {
  side: TemporalSide
  /** Minutes between the block and now (0 for current). */
  minutes: number
  /** 0 (touching now) → 1 (five hours or more away). */
  f: number
}

export const DEPTH_HORIZON_MIN = 300

export function getTemporalDepth(node: Pick<FieldNode, 'temporal' | 'startMin' | 'endMin'>, now: number): TemporalDepth {
  if (node.temporal === 'current') return { side: 'current', minutes: 0, f: 0 }
  const minutes = node.temporal === 'past' ? Math.max(0, now - node.endMin) : Math.max(0, node.startMin - now)
  return { side: node.temporal, minutes, f: Math.min(1, minutes / DEPTH_HORIZON_MIN) }
}

function toU(min: number, dayStart: number, dayEnd: number) {
  return (min - dayStart) / (dayEnd - dayStart)
}

/**
 * Build the field from the same DayView HOY uses. Day limits come from the
 * configured routine: first block start → start of the closing (sleep) block.
 */
export function buildDayField(view: DayView, now: number): DayFieldModel {
  const { timeline, current, routine } = view
  const meditationId = routine.meditation?.blockId
  const dayStart = timeline[0].startMin
  const last = timeline[timeline.length - 1]
  const dayEnd = last.kind === 'sleep' ? last.startMin : last.endMin

  const nodes: FieldNode[] = []
  const spaces: FieldSpace[] = []

  const toNode = (b: ScheduledBlock, temporal: TemporalSide): FieldNode => {
    const role = getVisualRole(b, meditationId)
    const uStart = toU(b.startMin, dayStart, dayEnd)
    const uEnd = role === 'endpoint' ? uStart : toU(Math.min(b.endMin, dayEnd), dayStart, dayEnd)
    return {
      id: b.id,
      name: b.shortTitle ?? b.title,
      title: b.title,
      role,
      kind: b.kind,
      energy: b.energy,
      startMin: b.startMin,
      endMin: b.endMin,
      temporal,
      execution: getExecution(b),
      uStart,
      uEnd,
      u: role === 'endpoint' ? 1 : (uStart + uEnd) / 2,
      concentration: CONCENTRATION[b.kind],
    }
  }

  for (const b of timeline) {
    const isCurrent = b.id === current.id
    const temporal: TemporalSide = isCurrent ? 'current' : b.endMin <= now ? 'past' : 'future'
    const role = getVisualRole(b, meditationId)
    if (role === 'space' && !isCurrent) {
      spaces.push({
        id: b.id,
        startMin: b.startMin,
        endMin: b.endMin,
        uStart: toU(b.startMin, dayStart, dayEnd),
        uEnd: toU(b.endMin, dayStart, dayEnd),
      })
      continue
    }
    nodes.push(toNode(b, temporal))
  }

  const nowU = toU(now, dayStart, dayEnd)
  let currentNode = nodes.find((n) => n.temporal === 'current')
  if (currentNode) {
    // The present node sits at the present, not at the middle of its block.
    currentNode.u = nowU
  } else {
    // Before the day's first block: still last night's sleep, just ahead of the day.
    currentNode = { ...toNode(current, 'current'), role: 'endpoint', uStart: nowU, uEnd: nowU, u: nowU }
    nodes.unshift(currentNode)
  }

  return { dayStart, dayEnd, now, nowU, nodes, spaces, current: currentNode }
}

/**
 * At most three names: the current block, one relevant block behind, one ahead.
 * Behind: the nearest past medium/major. Ahead: the next major, else the next medium.
 * `visible` lets the layout drop references that are off screen.
 */
export function getVisibleLabels(
  model: DayFieldModel,
  visible: (node: FieldNode) => boolean = () => true,
): { current: FieldNode; previous?: FieldNode; next?: FieldNode } {
  const relevant = (n: FieldNode) => n.role === 'medium' || n.role === 'major'
  const past = model.nodes.filter((n) => n.temporal === 'past' && relevant(n) && visible(n))
  const future = model.nodes.filter((n) => n.temporal === 'future' && relevant(n) && visible(n))
  const previous = past[past.length - 1]
  const next = future.find((n) => n.role === 'major') ?? future[0]
  return { current: model.current, previous, next }
}
