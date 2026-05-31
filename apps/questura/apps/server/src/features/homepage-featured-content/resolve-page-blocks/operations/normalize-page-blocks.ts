import type { PayloadRequest } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { normalizeArticleGridFourLayout } from '../../article-grid/service'
import {
  buildHotelGridGlobalData,
  normalizeHotelGridInput,
  validateHotelGridItems,
} from '../../hotel-grid/service'
import { normalizeLocationGridMediaAspect } from '../../location-grid/lib/media-aspect'
import {
  buildLocationGridGlobalData,
  normalizeLocationGridInput,
  validateLocationGridItems,
} from '../../location-grid/service'
import type { LocationGridScope } from '../../location-grid/types'
import {
  buildQuesturianMapsGlobalData,
  normalizeQuesturianMapsInput,
  validateQuesturianMapsItems,
} from '../../questurian-maps/service'
import {
  buildHomepageFeaturedGlobalData,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from '../../featured-articles/service'
import { resolveStoredSlotCountForBlockType } from '../../slot-count/service'
import {
  buildThingsToDoAttractionsGlobalData,
  normalizeThingsToDoAttractionsInput,
  validateThingsToDoAttractionsItems,
} from '../../things-to-do-attractions/service'
import {
  buildThingsToDoListiclesGlobalData,
  normalizeThingsToDoListiclesInput,
  validateThingsToDoListiclesItems,
} from '../../things-to-do-listicles/service'
import {
  buildTourGridGlobalData,
  normalizeTourGridInput,
  validateTourGridItems,
} from '../../tour-grid/service'
import {
  buildWhereToEatDrinkGlobalData,
  normalizeWhereToEatDrinkInput,
  validateWhereToEatDrinkItems,
} from '../../where-to-eat-drink/service'

type NormalizePageBlocksOptions = {
  originalPageBlocks?: unknown[]
}

function isCuratedHomepageBlockType(
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
  | 'article-list'
  | 'newsletter-signup' {
  return value === 'featured-article'
    || value === 'featured-article-carousel'
    || value === 'featured-articles'
    || value === 'article-grid'
    || value === 'location-grid'
    || value === 'questurian-maps'
    || value === 'hotel-grid'
    || value === 'tour-grid'
    || value === 'where-to-eat-drink'
    || value === 'things-to-do-listicles'
    || value === 'things-to-do-attractions'
    || value === 'article-list'
    || value === 'newsletter-signup'
}

/**
 * Mutates block `items` in place for curated blocks (same as Payload beforeValidate).
 * @param locationGridScope — child-location scope for location homepages
 */
export async function normalizePageBlocksArrayInPlace(
  req: PayloadRequest,
  pageBlocks: unknown[],
  locationGridScope: LocationGridScope | null,
  options: NormalizePageBlocksOptions = {},
): Promise<void> {
  const originalBlocksById = new Map<string, Record<string, unknown>>()
  for (const originalBlock of options.originalPageBlocks ?? []) {
    if (typeof originalBlock !== 'object' || originalBlock === null) continue
    const originalRecord = originalBlock as Record<string, unknown>
    if (typeof originalRecord.id === 'string' && originalRecord.id.trim()) {
      originalBlocksById.set(originalRecord.id, originalRecord)
    }
  }

  for (const block of pageBlocks) {
    if (
      typeof block !== 'object'
      || block === null
      || !isCuratedHomepageBlockType((block as Record<string, unknown>).blockType)
    ) {
      continue
    }

    const blockRecord = block as Record<string, unknown>
    const shouldValidateBlock = shouldValidatePageBlock(blockRecord, originalBlocksById)

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

    if (shouldValidateBlock && blockRecord.blockType === 'location-grid' && !locationGridScope) {
      throw new Error(
        'Location Grid blocks are only available on city homepages.',
      )
    }

    if (blockRecord.blockType === 'newsletter-signup') {
      blockRecord.items = []
      continue
    }

    if (!shouldValidateBlock || !Array.isArray(blockRecord.items) || blockRecord.items.length === 0) {
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
    } else if (blockRecord.blockType === 'tour-grid') {
      const refs = normalizeTourGridInput(blockRecord.items)
      await validateTourGridItems(req.payload, refs, {
        allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
        slotCount,
      })
      blockRecord.items = buildTourGridGlobalData(refs).items
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

function shouldValidatePageBlock(
  block: Record<string, unknown>,
  originalBlocksById: Map<string, Record<string, unknown>>,
): boolean {
  if (typeof block.id !== 'string' || !block.id.trim()) {
    return true
  }

  const original = originalBlocksById.get(block.id)
  if (!original) {
    return true
  }

  return stableStringify({
    blockType: block.blockType,
    slotCount: block.slotCount,
    items: block.items,
  }) !== stableStringify({
    blockType: original.blockType,
    slotCount: original.slotCount,
    items: original.items,
  })
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}
