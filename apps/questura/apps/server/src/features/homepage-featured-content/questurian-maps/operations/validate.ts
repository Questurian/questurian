import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { validateHomepageFeaturedItems } from '../../featured-articles/service'
import type { HomepageFeaturedItemRef } from '../../featured-articles/types'

import { HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT, QUESTURIAN_MAPS_RELATION } from '../constants'

export async function validateQuesturianMapsItems(
  payload: Payload,
  refs: HomepageFeaturedItemRef[],
  options: { allowDrafts?: boolean; slotCount?: number } = {},
): Promise<HomepageFeaturedItemRef[]> {
  const slotCount = options.slotCount ?? HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts

  for (const ref of refs) {
    if (ref.relationTo !== QUESTURIAN_MAPS_RELATION) {
      throw new Error('Questurian Maps blocks only support single-type-listicles.')
    }
  }

  return validateHomepageFeaturedItems(payload, refs, {
    allowDrafts,
    slotCount,
  })
}
