import {
  buildHomepageFeaturedGlobalData,
  normalizeHomepageFeaturedInput,
} from '../../featured-articles/service'
import type { HomepageFeaturedItemRef } from '../../featured-articles/types'

import { QUESTURIAN_MAPS_RELATION } from '../constants'

export function normalizeQuesturianMapsInput(rawItems: unknown): HomepageFeaturedItemRef[] {
  const refs = normalizeHomepageFeaturedInput(rawItems)
  if (refs.some((ref) => ref.relationTo !== QUESTURIAN_MAPS_RELATION)) {
    throw new Error('Questurian Maps blocks only support single-type-listicles.')
  }
  return refs
}

export function buildQuesturianMapsGlobalData(items: HomepageFeaturedItemRef[]) {
  return buildHomepageFeaturedGlobalData(items)
}
