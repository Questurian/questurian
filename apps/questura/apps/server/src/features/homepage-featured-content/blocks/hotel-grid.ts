import type { Block } from 'payload'

import {
  HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
  HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
} from '../types'

export const HotelGridBlock: Block = {
  slug: 'hotel-grid',
  labels: {
    singular: 'Hotel Grid',
    plural: 'Hotel Grid Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: HOMEPAGE_HOTEL_GRID_MIN_SLOTS,
      max: HOMEPAGE_HOTEL_GRID_MAX_SLOTS,
      admin: {
        description: 'How many hotel cards this block contains.',
      },
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: 'accommodations',
      hasMany: true,
      admin: {
        description: 'Hotels in display order.',
      },
    },
  ],
}
