import {
  buildHomepageFeaturedGlobalData,
  normalizeHomepageFeaturedInput,
} from '../../featured-articles/service'
import type { HomepageWhereToEatDrinkItemRef } from '../types'

import { WHERE_TO_EAT_DRINK_COLLECTION } from '../constants'

export function normalizeWhereToEatDrinkInput(
  rawItems: unknown,
): HomepageWhereToEatDrinkItemRef[] {
  const refs = normalizeHomepageFeaturedInput(rawItems)
  if (refs.some((ref) => ref.relationTo !== WHERE_TO_EAT_DRINK_COLLECTION)) {
    throw new Error('Where to Eat & Drink blocks only support single-type-listicles items.')
  }
  return refs
}

export function buildWhereToEatDrinkGlobalData(items: HomepageWhereToEatDrinkItemRef[]) {
  return buildHomepageFeaturedGlobalData(items)
}
