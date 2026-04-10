import type { PayloadRequest } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import {
  buildHotelGridGlobalData,
  normalizeHotelGridInput,
  validateHotelGridItems,
} from './hotel-grid-service'
import {
  buildLocationGridGlobalData,
  normalizeLocationGridInput,
  validateLocationGridItems,
  type LocationGridScope,
} from './location-grid-service'
import {
  buildHomepageFeaturedGlobalData,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from './service'
import {
  buildThingsToDoAttractionsGlobalData,
  normalizeThingsToDoAttractionsInput,
  validateThingsToDoAttractionsItems,
} from './things-to-do-attractions-service'
import {
  buildThingsToDoListiclesGlobalData,
  normalizeThingsToDoListiclesInput,
  validateThingsToDoListiclesItems,
} from './things-to-do-listicles-service'
import { HOMEPAGE_FEATURED_ARTICLE_SLOT_COUNT, HOMEPAGE_FEATURED_CONTENT_SLOTS } from './types'
import {
  buildWhereToEatDrinkGlobalData,
  normalizeWhereToEatDrinkInput,
  validateWhereToEatDrinkItems,
} from './where-to-eat-drink-service'

export function isCuratedHomepageBlockType(
  value: unknown,
): value is
  | 'featured-article'
  | 'featured-articles'
  | 'article-grid'
  | 'location-grid'
  | 'hotel-grid'
  | 'where-to-eat-drink'
  | 'things-to-do-listicles'
  | 'things-to-do-attractions' {
  return value === 'featured-article'
    || value === 'featured-articles'
    || value === 'article-grid'
    || value === 'location-grid'
    || value === 'hotel-grid'
    || value === 'where-to-eat-drink'
    || value === 'things-to-do-listicles'
    || value === 'things-to-do-attractions'
}

/**
 * Mutates block `items` in place for curated blocks (same as Payload beforeValidate).
 * @param locationGridScope — MAIN scope for main homepage; city/neighborhood scope for location homepages
 */
export async function normalizePageBlocksArrayInPlace(
  req: PayloadRequest,
  pageBlocks: unknown[],
  locationGridScope: LocationGridScope | null,
): Promise<void> {
  for (const block of pageBlocks) {
    if (
      typeof block !== 'object'
      || block === null
      || !isCuratedHomepageBlockType((block as Record<string, unknown>).blockType)
    ) {
      continue
    }

    const blockRecord = block as Record<string, unknown>

    if (blockRecord.blockType === 'location-grid' && !locationGridScope) {
      throw new Error(
        'Location Grid blocks are only available on the main homepage and city homepages.',
      )
    }

    if (!Array.isArray(blockRecord.items) || blockRecord.items.length === 0) {
      continue
    }

    const slotCount =
      blockRecord.blockType === 'featured-article'
        ? HOMEPAGE_FEATURED_ARTICLE_SLOT_COUNT
        : typeof blockRecord.slotCount === 'number' && blockRecord.slotCount >= 1
          ? Math.trunc(blockRecord.slotCount)
          : HOMEPAGE_FEATURED_CONTENT_SLOTS

    if (blockRecord.blockType === 'location-grid') {
      const refs = normalizeLocationGridInput(blockRecord.items)
      await validateLocationGridItems(req.payload, refs, {
        scope: locationGridScope,
        slotCount,
      })
      blockRecord.items = buildLocationGridGlobalData(refs).items
    } else if (blockRecord.blockType === 'hotel-grid') {
      const refs = normalizeHotelGridInput(blockRecord.items)
      await validateHotelGridItems(req.payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount,
      })
      blockRecord.items = buildHotelGridGlobalData(refs).items
    } else if (blockRecord.blockType === 'where-to-eat-drink') {
      const refs = normalizeWhereToEatDrinkInput(blockRecord.items)
      await validateWhereToEatDrinkItems(req.payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount,
      })
      blockRecord.items = buildWhereToEatDrinkGlobalData(refs).items
    } else if (blockRecord.blockType === 'things-to-do-listicles') {
      const refs = normalizeThingsToDoListiclesInput(blockRecord.items)
      await validateThingsToDoListiclesItems(req.payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount,
      })
      blockRecord.items = buildThingsToDoListiclesGlobalData(refs).items
    } else if (blockRecord.blockType === 'things-to-do-attractions') {
      const refs = normalizeThingsToDoAttractionsInput(blockRecord.items)
      await validateThingsToDoAttractionsItems(req.payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount,
      })
      blockRecord.items = buildThingsToDoAttractionsGlobalData(refs).items
    } else {
      const refs = normalizeHomepageFeaturedInput(blockRecord.items)
      await validateHomepageFeaturedItems(req.payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount,
      })
      blockRecord.items = buildHomepageFeaturedGlobalData(refs).items
    }
  }
}
