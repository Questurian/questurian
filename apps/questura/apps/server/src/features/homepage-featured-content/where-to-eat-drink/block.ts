import type { Block } from 'payload'

import { createReferenceGridBlock } from '../reference-grid/block'
import {
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
} from '../types'

export const WhereToEatDrinkBlock: Block = createReferenceGridBlock({
  slug: 'where-to-eat-drink',
  labels: {
    singular: 'Where to Eat & Drink',
    plural: 'Where to Eat & Drink Blocks',
  },
  slotCounts: {
    min: HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
    max: HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  },
  relationTo: ['single-type-listicles'],
  slotCountDescription: 'How many dining listicles this block contains.',
  itemsDescription: 'Dining single-type listicles in display order.',
})
