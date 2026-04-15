import type { PayloadRequest } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import {
  buildHotelGridGlobalData,
  normalizeHotelGridInput,
  validateHotelGridItems,
} from './hotel-grid-service'
import { normalizeArticleGridFourLayout } from './article-grid-four-layout'
import { normalizeLocationGridMediaAspect } from './location-grid-media-aspect'
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
import {
  buildQuesturianMapsGlobalData,
  normalizeQuesturianMapsInput,
  validateQuesturianMapsItems,
} from './questurian-maps-service'
import { resolveStoredSlotCountForBlockType } from './slot-count-for-block-type'
import {
  buildWhereToEatDrinkGlobalData,
  normalizeWhereToEatDrinkInput,
  validateWhereToEatDrinkItems,
} from './where-to-eat-drink-service'

export function isCuratedHomepageBlockType(
  value: unknown,
): value is
  | 'featured-article'
  | 'featured-article-carousel'
  | 'featured-articles'
  | 'article-grid'
  | 'location-grid'
  | 'questurian-maps'
  | 'hotel-grid'
  | 'where-to-eat-drink'
  | 'things-to-do-listicles'
  | 'things-to-do-attractions'
  | 'newsletter-signup' {
  return value === 'featured-article'
    || value === 'featured-article-carousel'
    || value === 'featured-articles'
    || value === 'article-grid'
    || value === 'location-grid'
    || value === 'questurian-maps'
    || value === 'hotel-grid'
    || value === 'where-to-eat-drink'
    || value === 'things-to-do-listicles'
    || value === 'things-to-do-attractions'
    || value === 'newsletter-signup'
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

    const slotCount = resolveStoredSlotCountForBlockType(
      String(blockRecord.blockType),
      blockRecord.slotCount,
    )
    blockRecord.slotCount = slotCount

    if (blockRecord.blockType === 'location-grid') {
      blockRecord.mediaAspect = normalizeLocationGridMediaAspect(blockRecord.mediaAspect)
    }

    if (blockRecord.blockType === 'article-grid' && slotCount === 4) {
      blockRecord.articleGridFourLayout = normalizeArticleGridFourLayout(
        blockRecord.articleGridFourLayout,
      )
    }

    if (blockRecord.blockType === 'location-grid' && !locationGridScope) {
      throw new Error(
        'Location Grid blocks are only available on the main homepage and city homepages.',
      )
    }

    if (blockRecord.blockType === 'newsletter-signup') {
      blockRecord.items = []
      continue
    }

    if (!Array.isArray(blockRecord.items) || blockRecord.items.length === 0) {
      continue
    }

    if (blockRecord.blockType === 'questurian-maps') {
      const refs = normalizeQuesturianMapsInput(blockRecord.items)
      await validateQuesturianMapsItems(req.payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount,
      })
      blockRecord.items = buildQuesturianMapsGlobalData(refs).items
    } else if (blockRecord.blockType === 'location-grid') {
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
