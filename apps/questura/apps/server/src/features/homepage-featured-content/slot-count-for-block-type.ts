import { LOCATION_GRID_MAX_SLOTS, LOCATION_GRID_MIN_SLOTS } from './location-grid-service'
import {
  HOMEPAGE_FEATURED_CONTENT_SLOTS,
  HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
  HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
  HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
} from './types'

/**
 * Canonical min/max slot counts per block type. Used to fix stale `slotCount` after block-type
 * changes (Payload may keep the previous type’s value).
 */
export const HOMEPAGE_BLOCK_SLOT_LIMITS = {
  'featured-article': { min: 1, max: 1 },
  'featured-articles': { min: 3, max: 9 },
  'article-grid': { min: 3, max: 5 },
  'location-grid': { min: LOCATION_GRID_MIN_SLOTS, max: LOCATION_GRID_MAX_SLOTS },
  'questurian-maps': {
    min: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
    max: HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
  },
  'hotel-grid': { min: HOMEPAGE_HOTEL_GRID_MIN_SLOTS, max: HOMEPAGE_HOTEL_GRID_MAX_SLOTS },
  'where-to-eat-drink': {
    min: HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
    max: HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  },
  'things-to-do-listicles': {
    min: HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
    max: HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  },
  'things-to-do-attractions': {
    min: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
    max: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  },
} as const

export type HomepageBlockSlotTyped = keyof typeof HOMEPAGE_BLOCK_SLOT_LIMITS

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

  return Math.min(Math.max(raw, min), max)
}
