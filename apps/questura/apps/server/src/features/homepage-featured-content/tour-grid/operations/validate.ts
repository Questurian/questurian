import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import type { HomepageTourItemRef, TourGridValidationOptions } from '../types'

import { HOMEPAGE_FEATURED_CONTENT_SLOTS } from '../constants'
import { findTourDoc } from '../lib/repository'

export async function validateTourGridItems(
  payload: Payload,
  refs: HomepageTourItemRef[],
  options: TourGridValidationOptions = {},
): Promise<HomepageTourItemRef[]> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const slotCount = options.slotCount ?? HOMEPAGE_FEATURED_CONTENT_SLOTS

  if (refs.length !== slotCount) {
    throw new Error(`This block requires exactly ${slotCount} item${slotCount === 1 ? '' : 's'}.`)
  }

  const ids = new Set<number>()
  for (const ref of refs) {
    if (ids.has(ref.id)) throw new Error('Tour grid cannot contain duplicate tours.')
    ids.add(ref.id)
  }

  await Promise.all(
    refs.map(async (ref) => {
      const candidate = await findTourDoc(payload, ref)
      if (!candidate) throw new Error(`Tour #${ref.id} could not be found.`)
      if (!allowDrafts && candidate.status !== 'published') {
        throw new Error(`Tour "${candidate.title}" must be published before it can be featured.`)
      }
    }),
  )

  return refs
}
