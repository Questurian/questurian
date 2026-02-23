import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'

export const DataAttractionsBlock: Block = {
  slug: 'data-attractions',
  labels: {
    singular: 'Attraction Item',
    plural: 'Attraction Items',
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'attractions',
      required: true,
      filterOptions: createLocationFilter('attractions'),
      admin: {
        description: 'Select an attraction listing for this ranked item',
      },
    },
    {
      name: 'blurb',
      type: 'richText',
      required: true,
      admin: {
        description: 'Editorial blurb for why this item is on the list',
      },
    },
  ],
}
