/**
 * Reader-facing lock state, as sent by the Questura Server public routes.
 *
 * Always present on an article payload, on free items too, so the client never
 * has to infer "locked" from an absent key.
 */
export type GateState = {
  access: 'free' | 'member'
  locked: boolean
  unit: 'blocks' | 'items' | 'days'
  shown: number
  total: number
}

/** Marks the element standing in for the withheld content, for `cssSelector`. */
export const PAYWALL_SELECTOR = '[data-paywalled]'

export function readGate(article: unknown): GateState | null {
  if (!article || typeof article !== 'object') return null
  const gate = (article as { gate?: unknown }).gate
  if (!gate || typeof gate !== 'object') return null

  const candidate = gate as Partial<GateState>
  if (typeof candidate.locked !== 'boolean') return null

  return {
    access: candidate.access === 'member' ? 'member' : 'free',
    locked: candidate.locked,
    unit:
      candidate.unit === 'items' || candidate.unit === 'days' ? candidate.unit : 'blocks',
    shown: Number.isFinite(candidate.shown) ? Number(candidate.shown) : 0,
    total: Number.isFinite(candidate.total) ? Number(candidate.total) : 0,
  }
}

export function isLocked(article: unknown): boolean {
  return readGate(article)?.locked === true
}

export type LockCopy = {
  /** What the reader is looking at, or null when there is nothing useful to say. */
  headline: string | null
  cta: string
}

/**
 * Names what is being withheld, in the unit the server actually cut on.
 *
 * Itineraries keep no day at all, so the old "Day 1 of 5" phrasing would read
 * as "Day 0 of 5" -- which sounds like a bug rather than an offer. The pitch
 * for an itinerary is the trip length being unlocked, not the fraction shown.
 */
export function describeLock(gate: GateState): LockCopy {
  if (!gate.locked) return { headline: null, cta: 'Unlock the full guide' }

  if (gate.unit === 'days') {
    return {
      headline: 'Your stay is above. The day-by-day plan is for members.',
      cta: gate.total > 0 ? `Unlock all ${gate.total} days` : 'Unlock the full itinerary',
    }
  }

  if (gate.total > gate.shown && gate.shown > 0) {
    return {
      headline: `You're reading the first ${gate.shown} of ${gate.total} sections.`,
      cta: 'Unlock the full guide',
    }
  }

  return { headline: null, cta: 'Unlock the full guide' }
}
