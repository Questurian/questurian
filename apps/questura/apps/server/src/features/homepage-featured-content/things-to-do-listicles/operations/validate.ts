import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { validateHomepageFeaturedItems } from '../../featured-articles/service'
import type {
  HomepageThingsToDoListiclesItemRef,
  ThingsToDoListiclesValidationOptions,
} from '../types'

import {
  THINGS_TO_DO_LISTICLES_COLLECTION,
  THINGS_TO_DO_LISTICLES_LISTICLE_TYPE,
} from '../constants'
import { findThingsToDoListicleDoc } from '../lib/repository'

export async function validateThingsToDoListiclesItems(
  payload: Payload,
  refs: HomepageThingsToDoListiclesItemRef[],
  options: ThingsToDoListiclesValidationOptions = {},
): Promise<HomepageThingsToDoListiclesItemRef[]> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const validated = await validateHomepageFeaturedItems(payload, refs, {
    allowDrafts,
    slotCount: options.slotCount,
  })

  await Promise.all(
    validated.map(async (ref) => {
      if (ref.relationTo !== THINGS_TO_DO_LISTICLES_COLLECTION) {
        throw new Error(
          'Things to Do (listicles) blocks only support single-type-listicles items.',
        )
      }
      const doc = await findThingsToDoListicleDoc(payload, ref)
      if (doc.listicleType !== THINGS_TO_DO_LISTICLES_LISTICLE_TYPE) {
        const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title : `#${ref.id}`
        throw new Error(
          `"${title}" is not an attractions listicle and cannot be used in this block.`,
        )
      }
    }),
  )

  return validated
}
