import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { itineraryDurationRow, itineraryTimeRow } from './utils/timeField'

export const ItineraryAttractionsBlock: Block = {
  slug: 'itinerary-attractions',
  labels: {
    singular: 'Attraction Stop',
    plural: 'Attraction Stops',
  },
  fields: [
    itineraryTimeRow,
    itineraryDurationRow,
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'attractions',
      required: true,
      filterOptions: createLocationFilter('attractions'),
      admin: {
        description: 'Select an attraction listing for this itinerary timeslot',
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
