import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { itineraryDurationRow, itineraryTimeRow } from './utils/timeField'

export const ItineraryKeyLocationsBlock: Block = {
  slug: 'itinerary-key-location',
  labels: {
    singular: 'Key Location Stop',
    plural: 'Key Location Stops',
  },
  fields: [
    itineraryTimeRow,
    itineraryDurationRow,
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'key-locations',
      required: true,
      filterOptions: createLocationFilter('key-locations'),
      admin: {
        description: 'Select a key location for this itinerary timeslot',
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
