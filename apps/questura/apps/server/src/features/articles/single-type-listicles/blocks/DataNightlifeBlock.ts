import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { createItemMediaFields } from './utils/itemMedia'
import { angleField } from './utils/angleField'

export const DataNightlifeBlock: Block = {
  slug: 'data-nightlife',
  labels: {
    singular: 'Nightlife Item',
    plural: 'Nightlife Items',
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'nightlife',
      required: true,
      filterOptions: createLocationFilter('nightlife'),
      admin: {
        description: 'Select a nightlife listing for this ranked item',
      },
    },
    ...createItemMediaFields('nightlife'),
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
