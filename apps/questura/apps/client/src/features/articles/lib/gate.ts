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

/**
 * How much is being withheld, phrased in the unit the server cut on: "Day 1 of
 * 5" reads as a sample, where "part of this article" reads as an error.
 */
export function describeSample(gate: GateState): string | null {
  if (!gate.locked || gate.total <= 0) return null

  if (gate.unit === 'days') {
    return gate.total > gate.shown
      ? `Day ${gate.shown} of ${gate.total}`
      : `${gate.total} day${gate.total === 1 ? '' : 's'}`
  }

  const noun = gate.unit === 'items' ? 'stop' : 'section'
  return `${gate.shown} of ${gate.total} ${noun}${gate.total === 1 ? '' : 's'}`
}
