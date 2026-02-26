import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { createItineraryItemMediaFields } from './utils/itemMedia'
import { itineraryDurationRow, itineraryTimeRow } from './utils/timeField'

export const ItineraryDiningBlock: Block = {
  slug: 'itinerary-dining',
  labels: {
    singular: 'Dining Stop',
    plural: 'Dining Stops',
  },
  fields: [
    itineraryTimeRow,
    itineraryDurationRow,
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
