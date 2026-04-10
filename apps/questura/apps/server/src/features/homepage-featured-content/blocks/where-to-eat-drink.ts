import type { Block } from 'payload'

import {
  HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
  HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
} from '../types'

export const WhereToEatDrinkBlock: Block = {
  slug: 'where-to-eat-drink',
  labels: {
    singular: 'Where to Eat & Drink',
    plural: 'Where to Eat & Drink Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS,
      max: HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS,
      admin: {
        description: 'How many dining listicles this block contains.',
      },
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: 'single-type-listicles',
      hasMany: true,
      admin: {
        description: 'Dining single-type listicles in display order.',
      },
    },
  ],
}
