/**
 * Entry memory, kept apart from the day state: it spans days.
 */
const KEY = 'personal-os:entry'

export interface EntryMemory {
  /** Local date on which ENTRAR was pressed in the full daily entry. */
  dailyEntrySeenDate?: string
  /** Message shown on a given date (kept stable for the whole day). */
  dailyMessage?: { date: string; id: string }
  /** Last moment the app was in use, real time (ms). */
  lastActiveAt?: number
}

export function loadEntryMemory(): EntryMemory {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as EntryMemory) : {}
  } catch {
    return {}
  }
}

export function saveEntryMemory(patch: Partial<EntryMemory>): void {
  try {
    const next = { ...loadEntryMemory(), ...patch }
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: entries simply behave as a first open.
  }
}
