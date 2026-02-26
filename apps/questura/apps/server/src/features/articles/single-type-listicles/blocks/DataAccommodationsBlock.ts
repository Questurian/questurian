import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { createItemMediaFields } from './utils/itemMedia'

export const DataAccommodationsBlock: Block = {
  slug: 'data-accommodations',
  labels: {
    singular: 'Accommodation Item',
    plural: 'Accommodation Items',
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'accommodations',
      required: true,
      filterOptions: createLocationFilter('accommodations'),
      admin: {
        description: 'Select an accommodation listing for this ranked item',
      },
    },
    ...createItemMediaFields('accommodations'),
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
