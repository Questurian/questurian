import type { Block } from 'payload'

import { createReferenceGridBlock } from '../reference-grid/block'
import { HOMEPAGE_HOTEL_GRID_MAX_SLOTS, HOMEPAGE_HOTEL_GRID_MIN_SLOTS } from '../types'

export const HotelGridBlock: Block = createReferenceGridBlock({
  slug: 'hotel-grid',
  labels: {
    singular: 'Hotel Grid',
    plural: 'Hotel Grid Blocks',
  },
  slotCounts: { min: HOMEPAGE_HOTEL_GRID_MIN_SLOTS, max: HOMEPAGE_HOTEL_GRID_MAX_SLOTS },
  relationTo: 'accommodations',
  slotCountDescription: 'How many hotel cards this block contains.',
  itemsDescription: 'Hotels in display order.',
})
