import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { createItineraryItemMediaFields } from './utils/itemMedia'

export const ItineraryWhereStayingBlock: Block = {
  slug: 'itinerary-where-staying',
  labels: {
    singular: "Where You're Staying",
    plural: "Where You're Staying",
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'accommodations',
      required: true,
      filterOptions: createLocationFilter('accommodations'),
      admin: {
        description: 'Select the accommodation for this night or segment (separate from timed stops)',
      },
    },
    ...createItineraryItemMediaFields('accommodations'),
    {
      name: 'blurb',
      type: 'richText',
      required: true,
      admin: {
        description: "Editorial context for where you're staying",
      },
    },
  ],
}
