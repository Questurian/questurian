import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { createItineraryItemMediaFields } from './utils/itemMedia'

export const ItineraryNightlifeBlock: Block = {
  slug: 'itinerary-nightlife',
  labels: {
    singular: 'Nightlife Stop',
    plural: 'Nightlife Stops',
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'nightlife',
      required: true,
      filterOptions: createLocationFilter('nightlife'),
      admin: {
        description: 'Select a nightlife listing for this itinerary timeslot',
      },
    },
    ...createItineraryItemMediaFields('nightlife'),
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
