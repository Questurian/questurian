import { LOCATION_GRID_MAX_SLOTS, LOCATION_GRID_MIN_SLOTS } from './location-grid/service'
import {
  HOMEPAGE_FEATURED_CONTENT_SLOTS,
  HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
  HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
  HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
  HOMEPAGE_TOUR_GRID_MAX_SLOTS,
  HOMEPAGE_TOUR_GRID_MIN_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
} from './types'

/**
 * Canonical min/max slot counts per block type. Used to fix stale `slotCount` after block-type
 * changes (Payload may keep the previous type’s value).
 */
export const HOMEPAGE_BLOCK_SLOT_LIMITS = {
  'featured-article': { min: 1, max: 1 },
  'featured-article-carousel': { min: 2, max: 10 },
  'featured-articles': { min: 3, max: 9 },
  /** Only 4 or 8 are valid; see {@link resolveStoredSlotCountForBlockType}. */
  'article-grid': { min: 4, max: 8 },
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
  'tour-grid': { min: HOMEPAGE_TOUR_GRID_MIN_SLOTS, max: HOMEPAGE_TOUR_GRID_MAX_SLOTS },
  /** Placeholder section; no curated slots. */
  'newsletter-signup': { min: 0, max: 0 },
  'article-list': { min: 5, max: 25 },
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

  if (blockType === 'article-grid') {
    return raw === 8 ? 8 : 4
  }

  return Math.min(Math.max(raw, min), max)
}

/** Slot count accepted by POST /blocks when adding a block (strict for article-grid: 4 or 8 only). */
export function isValidRequestedSlotCount(blockType: string, n: number): boolean {
  const limits = HOMEPAGE_BLOCK_SLOT_LIMITS[blockType as HomepageBlockSlotTyped]
  if (!limits) return Number.isInteger(n) && n >= 1

  if (blockType === 'article-grid') {
    return n === 4 || n === 8
  }

  if (limits.min === limits.max) {
    return n === limits.min
  }

  return n >= limits.min && n <= limits.max
}
