import { Block } from 'payload'
import { angleField } from './utils/angleField'
import { createLocationFilter } from './utils/locationFilter'
import { createItineraryItemMediaFields } from './utils/itemMedia'

export const ItineraryDiningBlock: Block = {
  slug: 'itinerary-dining',
  labels: {
    singular: 'Dining Stop',
    plural: 'Dining Stops',
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'dining',
      required: true,
      filterOptions: createLocationFilter('dining'),
      admin: {
        description: 'Select a dining listing for this itinerary timeslot',
      },
    },
    ...createItineraryItemMediaFields('dining'),
    angleField,
    {
      name: 'blurb',
      type: 'richText',
      required: true,
      admin: {
        description: 'Editorial context for this stop',
      },
    },
  ],
}
