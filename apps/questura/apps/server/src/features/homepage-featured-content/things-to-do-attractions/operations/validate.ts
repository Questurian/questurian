import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import type { HomepageHotelItemRef } from '../../types'
import type { ThingsToDoAttractionsValidationOptions } from '../types'

import { HOMEPAGE_FEATURED_CONTENT_SLOTS } from '../constants'
import { findAttractionDoc } from '../lib/repository'

export async function validateThingsToDoAttractionsItems(
  payload: Payload,
  refs: HomepageHotelItemRef[],
  options: ThingsToDoAttractionsValidationOptions = {},
): Promise<HomepageHotelItemRef[]> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const slotCount = options.slotCount ?? HOMEPAGE_FEATURED_CONTENT_SLOTS

  if (refs.length !== slotCount) {
    throw new Error(`This block requires exactly ${slotCount} item${slotCount === 1 ? '' : 's'}.`)
  }

  const ids = new Set<number>()
  for (const ref of refs) {
    if (ids.has(ref.id))
      throw new Error('Things to Do (places) cannot contain duplicate attractions.')
    ids.add(ref.id)
  }

  await Promise.all(
    refs.map(async (ref) => {
      const candidate = await findAttractionDoc(payload, ref)
      if (!candidate) throw new Error(`Attraction #${ref.id} could not be found.`)
      if (!allowDrafts && candidate.status !== 'published') {
        throw new Error(
          `Attraction "${candidate.title}" must be published before it can be featured.`,
        )
      }
      if (!candidate.imageUrl) {
        throw new Error(
          `Attraction "${candidate.title}" is missing a gallery card image. Add a media set with the required card variant before featuring it.`,
        )
      }
    }),
  )

  return refs
}
