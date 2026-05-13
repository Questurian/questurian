import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { validateHomepageFeaturedItems } from '../../featured-articles/service'
import type {
  HomepageWhereToEatDrinkItemRef,
  WhereToEatDrinkValidationOptions,
} from '../types'

import { WHERE_TO_EAT_DRINK_COLLECTION, WHERE_TO_EAT_DRINK_LISTICLE_TYPE } from '../constants'
import { findWhereToEatDrinkDoc } from '../lib/repository'

export async function validateWhereToEatDrinkItems(
  payload: Payload,
  refs: HomepageWhereToEatDrinkItemRef[],
  options: WhereToEatDrinkValidationOptions = {},
): Promise<HomepageWhereToEatDrinkItemRef[]> {
  const allowDrafts = options.allowDrafts ?? APP_CONFIG.features.homepageFeaturedAllowDrafts
  const validated = await validateHomepageFeaturedItems(payload, refs, {
    allowDrafts,
    slotCount: options.slotCount,
  })

  await Promise.all(
    validated.map(async (ref) => {
      if (ref.relationTo !== WHERE_TO_EAT_DRINK_COLLECTION) {
        throw new Error('Where to Eat & Drink blocks only support single-type-listicles items.')
      }
      const doc = await findWhereToEatDrinkDoc(payload, ref)
      if (doc.listicleType !== WHERE_TO_EAT_DRINK_LISTICLE_TYPE) {
        const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title : `#${ref.id}`
        throw new Error(`"${title}" is not a dining listicle and cannot be used in this block.`)
      }
    }),
  )

  return validated
}
