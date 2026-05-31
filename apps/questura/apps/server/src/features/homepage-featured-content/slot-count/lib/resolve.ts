import { HOMEPAGE_FEATURED_CONTENT_SLOTS } from '../../types'

import { HOMEPAGE_BLOCK_SLOT_LIMITS, type HomepageBlockSlotTyped } from '../constants'

function fallbackInRange(min: number, max: number): number {
  if (min === max) return min
  return Math.min(Math.max(4, min), max)
}

/**
 * Returns the effective slot count for a block type. Clamps stored values to that type’s limits
 * so a leftover count from a prior block type cannot leak into the UI or validation.
 */
export function resolveStoredSlotCountForBlockType(
  blockType: string,
  storedSlotCount: unknown,
): number {
  const limits = HOMEPAGE_BLOCK_SLOT_LIMITS[blockType as HomepageBlockSlotTyped]
  if (!limits) {
    const n =
      typeof storedSlotCount === 'number' && Number.isFinite(storedSlotCount)
        ? Math.trunc(storedSlotCount)
        : HOMEPAGE_FEATURED_CONTENT_SLOTS
    return Math.max(1, n)
  }

  const { min, max } = limits
  if (min === max) return min

  const raw =
    typeof storedSlotCount === 'number' && Number.isFinite(storedSlotCount)
      ? Math.trunc(storedSlotCount)
      : null

  if (raw === null) {
    return fallbackInRange(min, max)
  }

  if (blockType === 'article-grid') {
    return raw === 8 ? 8 : 4
  }

  const clamped = Math.min(Math.max(raw, min), max)

  // Featured Articles has no 6-slot layout; snap a stored 6 down to 5.
  if (blockType === 'featured-articles' && clamped === 6) {
    return 5
  }

  return clamped
}

/** Slot count accepted by POST /blocks when adding a block (strict for article-grid: 4 or 8 only). */
export function isValidRequestedSlotCount(blockType: string, n: number): boolean {
  const limits = HOMEPAGE_BLOCK_SLOT_LIMITS[blockType as HomepageBlockSlotTyped]
  if (!limits) return Number.isInteger(n) && n >= 1

  if (blockType === 'article-grid') {
    return n === 4 || n === 8
  }

  // Featured Articles has no 6-slot layout, so 6 is not an accepted count.
  if (blockType === 'featured-articles' && n === 6) {
    return false
  }

  if (limits.min === limits.max) {
    return n === limits.min
  }

  return n >= limits.min && n <= limits.max
}
