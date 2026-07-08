import type { Block } from 'payload'

import { createReferenceGridBlock } from '../reference-grid/block'
import { HOMEPAGE_TOUR_GRID_MAX_SLOTS, HOMEPAGE_TOUR_GRID_MIN_SLOTS } from '../types'

export const TourGridBlock: Block = createReferenceGridBlock({
  slug: 'tour-grid',
  labels: {
    singular: 'Tour Grid',
    plural: 'Tour Grid Blocks',
  },
  slotCounts: { min: HOMEPAGE_TOUR_GRID_MIN_SLOTS, max: HOMEPAGE_TOUR_GRID_MAX_SLOTS },
  relationTo: 'tours',
  slotCountDescription: 'How many tour cards this block contains.',
  itemsDescription: 'Tours in display order.',
})
