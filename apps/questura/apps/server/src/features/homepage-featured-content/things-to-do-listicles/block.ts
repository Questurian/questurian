import type { Block } from 'payload'

import { createReferenceGridBlock } from '../reference-grid/block'
import {
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
} from '../types'

export const ThingsToDoListiclesBlock: Block = createReferenceGridBlock({
  slug: 'things-to-do-listicles',
  labels: {
    singular: 'Things to Do — Listicles',
    plural: 'Things to Do — Listicle Blocks',
  },
  slotCounts: {
    min: HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS,
    max: HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS,
  },
  relationTo: ['single-type-listicles'],
  slotCountDescription: 'How many attraction listicles this block contains.',
  itemsDescription: 'Single-type listicles with data type Attractions only.',
})
