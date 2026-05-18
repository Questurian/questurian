import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { createItemMediaFields } from './utils/itemMedia'
import { angleField } from './utils/angleField'

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
    ...createItemMediaFields('attractions'),
    angleField,
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
