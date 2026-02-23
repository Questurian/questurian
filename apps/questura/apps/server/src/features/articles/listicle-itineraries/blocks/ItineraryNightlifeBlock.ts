import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { itineraryDurationRow, itineraryTimeRow } from './utils/timeField'

export const ItineraryNightlifeBlock: Block = {
  slug: 'itinerary-nightlife',
  labels: {
    singular: 'Nightlife Stop',
    plural: 'Nightlife Stops',
  },
  fields: [
    itineraryTimeRow,
    itineraryDurationRow,
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
