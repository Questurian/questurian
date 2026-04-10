import type { Block } from 'payload'

import {
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
  HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
} from '../types'

export const ThingsToDoAttractionsBlock: Block = {
  slug: 'things-to-do-attractions',
  labels: {
    singular: 'Things to Do — Places',
    plural: 'Things to Do — Places Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS,
      max: HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS,
      admin: {
        description: 'How many attraction place cards this block contains.',
      },
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: 'attractions',
      hasMany: true,
      admin: {
        description: 'Attraction records in display order.',
      },
    },
  ],
}
