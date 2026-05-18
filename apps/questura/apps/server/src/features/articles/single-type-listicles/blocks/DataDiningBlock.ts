import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { createItemMediaFields } from './utils/itemMedia'
import { angleField } from './utils/angleField'

export const DataDiningBlock: Block = {
  slug: 'data-dining',
  labels: {
    singular: 'Dining Item',
    plural: 'Dining Items',
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'dining',
      required: true,
      filterOptions: createLocationFilter('dining'),
      admin: {
        description: 'Select a dining listing for this ranked item',
      },
    },
    ...createItemMediaFields('dining'),
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
