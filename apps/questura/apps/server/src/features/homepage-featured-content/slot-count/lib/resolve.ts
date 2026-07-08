import { HOMEPAGE_FEATURED_CONTENT_SLOTS } from '../../types'

import { curatedBlockRegistry } from '../../block-registry'

/**
 * Returns the effective slot count for a block type. Clamps stored values to that type’s limits
 * so a leftover count from a prior block type cannot leak into the UI or validation.
 */
export function resolveStoredSlotCountForBlockType(
  blockType: string,
  storedSlotCount: unknown,
): number {
  const definition = curatedBlockRegistry.get(blockType)
  if (!definition) {
    const n =
      typeof storedSlotCount === 'number' && Number.isFinite(storedSlotCount)
        ? Math.trunc(storedSlotCount)
        : HOMEPAGE_FEATURED_CONTENT_SLOTS
    return Math.max(1, n)
  }

  const {
    min,
    max,
    default: defaultSlotCount,
    validCounts,
    invalidFallback,
  } = definition.slotCounts
  if (min === max) return min

  const raw =
    typeof storedSlotCount === 'number' && Number.isFinite(storedSlotCount)
      ? Math.trunc(storedSlotCount)
      : null

  if (raw === null) {
    return defaultSlotCount
  }

  if (validCounts) {
    if (validCounts.includes(raw)) return raw
    if (invalidFallback === 'default') return defaultSlotCount
    if (raw < min) return min
    if (raw > max) return max
    const previous = [...validCounts].reverse().find((count) => count <= raw)
    return previous ?? defaultSlotCount
  }

  return Math.min(Math.max(raw, min), max)
}

/** Slot count accepted by POST /blocks when adding a block (strict for article-grid: 4 or 8 only). */
export function isValidRequestedSlotCount(blockType: string, n: number): boolean {
  const definition = curatedBlockRegistry.get(blockType)
  if (!definition) return Number.isInteger(n) && n >= 1

  const { min, max, validCounts } = definition.slotCounts
  if (validCounts) {
    return validCounts.includes(n)
  }

  if (min === max) {
    return n === min
  }

  return n >= min && n <= max
}
