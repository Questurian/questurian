import {
  buildHomepageFeaturedGlobalData,
  normalizeHomepageFeaturedInput,
} from '../../featured-articles/service'
import type { HomepageThingsToDoListiclesItemRef } from '../types'

import { THINGS_TO_DO_LISTICLES_COLLECTION } from '../constants'

export function normalizeThingsToDoListiclesInput(
  rawItems: unknown,
): HomepageThingsToDoListiclesItemRef[] {
  const refs = normalizeHomepageFeaturedInput(rawItems)
  if (refs.some((ref) => ref.relationTo !== THINGS_TO_DO_LISTICLES_COLLECTION)) {
    throw new Error('Things to Do (listicles) blocks only support single-type-listicles items.')
  }
  return refs
}

export function buildThingsToDoListiclesGlobalData(items: HomepageThingsToDoListiclesItemRef[]) {
  return buildHomepageFeaturedGlobalData(items)
}
