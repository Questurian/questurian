import type { Block } from 'payload'

export const LocationGridBlock: Block = {
  slug: 'location-grid',
  labels: {
    singular: 'Location Grid',
    plural: 'Location Grid Blocks',
  },
  fields: [
    {
      name: 'slotCount',
      type: 'number',
      required: true,
      min: 4,
      max: 8,
      admin: {
        description: 'How many child locations this grid contains.',
      },
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: 'locations',
      hasMany: true,
      admin: {
        description:
          'Locations in display order. Main homepages can select cities; city homepages can select neighborhoods.',
      },
    },
  ],
}
