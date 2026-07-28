let sequence = 0

/**
 * A unique id for something the author just added to a staged draft.
 *
 * The timestamp keeps ids sortable and distinct across sessions; the counter
 * makes uniqueness exact rather than probabilistic, because a burst of adds
 * lands inside a single millisecond; the random tail keeps two tabs editing at
 * the same instant apart.
 *
 * Ids are only ever compared, never parsed, so the shape is free to change —
 * but it must stay collision-free: content blocks, editorial blocks and media
 * blocks are all keyed and cross-referenced by these strings, and a duplicate
 * silently anchors the wrong content together.
 */
export function createStagedId(prefix: string): string {
  sequence += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now()}_${sequence.toString(36)}_${random}`
}
