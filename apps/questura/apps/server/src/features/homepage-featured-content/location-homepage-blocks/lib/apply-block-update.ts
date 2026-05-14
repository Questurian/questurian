import { APP_CONFIG } from '@/shared/config'
import type { PayloadInstance } from '@/types'

import {
  buildHomepageFeaturedGlobalData,
  normalizeHomepageFeaturedInput,
  validateHomepageFeaturedItems,
} from '../../featured-articles/service'
import {
  buildHotelGridGlobalData,
  normalizeHotelGridInput,
  validateHotelGridItems,
} from '../../hotel-grid/service'
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
import type { RawBlock } from '../../resolve-page-blocks/service'
import {
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
} from '../../types'
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
import type { ParsedBlockUpdateFields } from './parse-block-update'

type ApplyBlockItemsResult =
  | { ok: true; block: RawBlock }
  | { ok: false; status: number; message: string }

export async function applyBlockItemsUpdate(
  payload: PayloadInstance,
  block: RawBlock,
  items: unknown[],
  blockSlotCount: number,
  locationGridScope: LocationGridScope | null,
): Promise<ApplyBlockItemsResult> {
  if (block.blockType === 'location-grid') {
    const refs = normalizeLocationGridInput(items)
    const validatedRefs = await validateLocationGridItems(payload, refs, {
      scope: locationGridScope,
      slotCount: blockSlotCount,
    })

    return {
      ok: true,
      block: {
        ...block,
        slotCount: blockSlotCount,
        ...buildLocationGridGlobalData(validatedRefs),
      },
    }
  }

  if (block.blockType === 'questurian-maps') {
    if (blockSlotCount !== HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT) {
      return {
        ok: false,
        status: 400,
        message: `slotCount must be ${HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT} for "questurian-maps".`,
      }
    }

    const refs = normalizeQuesturianMapsInput(items)
    const validatedRefs = await validateQuesturianMapsItems(payload, refs, {
      allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
      slotCount: blockSlotCount,
    })

    return {
      ok: true,
      block: {
        ...block,
        slotCount: blockSlotCount,
        ...buildQuesturianMapsGlobalData(validatedRefs),
      },
    }
  }

  if (block.blockType === 'hotel-grid') {
    if (
      blockSlotCount < HOMEPAGE_HOTEL_GRID_MIN_SLOTS
      || blockSlotCount > HOMEPAGE_HOTEL_GRID_MAX_SLOTS
    ) {
      return {
        ok: false,
        status: 400,
        message: `slotCount must be between ${HOMEPAGE_HOTEL_GRID_MIN_SLOTS} and ${HOMEPAGE_HOTEL_GRID_MAX_SLOTS} for "hotel-grid".`,
      }
    }

    const refs = normalizeHotelGridInput(items)
    const validatedRefs = await validateHotelGridItems(payload, refs, {
      allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
      slotCount: blockSlotCount,
    })

    return {
      ok: true,
      block: {
        ...block,
        slotCount: blockSlotCount,
        ...buildHotelGridGlobalData(validatedRefs),
      },
    }
  }

  if (block.blockType === 'tour-grid') {
    if (
      blockSlotCount < HOMEPAGE_TOUR_GRID_MIN_SLOTS
      || blockSlotCount > HOMEPAGE_TOUR_GRID_MAX_SLOTS
    ) {
      return {
        ok: false,
        status: 400,
        message: `slotCount must be between ${HOMEPAGE_TOUR_GRID_MIN_SLOTS} and ${HOMEPAGE_TOUR_GRID_MAX_SLOTS} for "tour-grid".`,
      }
    }

    const refs = normalizeTourGridInput(items)
    const validatedRefs = await validateTourGridItems(payload, refs, {
      allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
      slotCount: blockSlotCount,
    })

    return {
      ok: true,
      block: {
        ...block,
        slotCount: blockSlotCount,
        ...buildTourGridGlobalData(validatedRefs),
      },
    }
  }

  if (block.blockType === 'where-to-eat-drink') {
    if (
      blockSlotCount < HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS
      || blockSlotCount > HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS
    ) {
      return {
        ok: false,
        status: 400,
        message: `slotCount must be between ${HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS} and ${HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS} for "where-to-eat-drink".`,
      }
    }

    const refs = normalizeWhereToEatDrinkInput(items)
    const validatedRefs = await validateWhereToEatDrinkItems(payload, refs, {
      allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
      slotCount: blockSlotCount,
    })

    return {
      ok: true,
      block: {
        ...block,
        slotCount: blockSlotCount,
        ...buildWhereToEatDrinkGlobalData(validatedRefs),
      },
    }
  }

  if (block.blockType === 'things-to-do-listicles') {
    if (
      blockSlotCount < HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS
      || blockSlotCount > HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS
    ) {
      return {
        ok: false,
        status: 400,
        message: `slotCount must be between ${HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS} and ${HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS} for "things-to-do-listicles".`,
      }
    }

    const refs = normalizeThingsToDoListiclesInput(items)
    const validatedRefs = await validateThingsToDoListiclesItems(payload, refs, {
      allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
      slotCount: blockSlotCount,
    })

    return {
      ok: true,
      block: {
        ...block,
        slotCount: blockSlotCount,
        ...buildThingsToDoListiclesGlobalData(validatedRefs),
      },
    }
  }

  if (block.blockType === 'things-to-do-attractions') {
    if (
      blockSlotCount < HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS
      || blockSlotCount > HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS
    ) {
      return {
        ok: false,
        status: 400,
        message: `slotCount must be between ${HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS} and ${HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS} for "things-to-do-attractions".`,
      }
    }

    const refs = normalizeThingsToDoAttractionsInput(items)
    const validatedRefs = await validateThingsToDoAttractionsItems(payload, refs, {
      allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
      slotCount: blockSlotCount,
    })

    return {
      ok: true,
      block: {
        ...block,
        slotCount: blockSlotCount,
        ...buildThingsToDoAttractionsGlobalData(validatedRefs),
      },
    }
  }

  if (block.blockType === 'newsletter-signup') {
    return {
      ok: false,
      status: 400,
      message: '"newsletter-signup" blocks do not support item updates.',
    }
  }

  const refs = normalizeHomepageFeaturedInput(items)
  const validatedRefs = await validateHomepageFeaturedItems(payload, refs, {
    allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
    slotCount: blockSlotCount,
  })

  return {
    ok: true,
    block: {
      ...block,
      slotCount: blockSlotCount,
      ...buildHomepageFeaturedGlobalData(validatedRefs),
    },
  }
}

export function applyBlockFieldUpdates(
  block: RawBlock,
  fields: ParsedBlockUpdateFields,
): RawBlock {
  let next = block

  if (!fields.sectionHeading.omit) {
    next = { ...next, sectionHeading: fields.sectionHeading.value }
  }
  if (!fields.sectionSubheading.omit) {
    next = { ...next, sectionSubheading: fields.sectionSubheading.value }
  }
  if (!fields.slot3Layout.omit) {
    next = { ...next, slot3Layout: fields.slot3Layout.value }
  }
  if (!fields.slot4Layout.omit) {
    next = { ...next, slot4Layout: fields.slot4Layout.value }
  }
  if (!fields.slot5Layout.omit) {
    next = { ...next, slot5Layout: fields.slot5Layout.value }
  }
  if (!fields.mediaAspect.omit) {
    next = { ...next, mediaAspect: fields.mediaAspect.value }
  }
  if (!fields.articleGridFourLayout.omit) {
    next = { ...next, articleGridFourLayout: fields.articleGridFourLayout.value }
  }

  return next
}
