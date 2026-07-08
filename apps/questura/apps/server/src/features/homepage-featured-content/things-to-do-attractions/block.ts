import type { Block } from 'payload'

import { createReferenceGridBlock } from '../reference-grid/block'
import {
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
} from '../types'

export const ThingsToDoAttractionsBlock: Block = createReferenceGridBlock({
  slug: 'things-to-do-attractions',
  labels: {
    singular: 'Things to Do — Places',
    plural: 'Things to Do — Places Blocks',
  },
  slotCounts: {
    min: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
    max: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  },
  relationTo: 'attractions',
  slotCountDescription: 'How many attraction place cards this block contains.',
  itemsDescription: 'Attraction records in display order.',
})
