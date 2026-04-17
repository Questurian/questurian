import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { createItineraryItemMediaFields } from './utils/itemMedia'

export const ItineraryKeyLocationsBlock: Block = {
  slug: 'itinerary-key-location',
  labels: {
    singular: 'Key Location Stop',
    plural: 'Key Location Stops',
  },
  fields: [
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
    ...createItineraryItemMediaFields('key-locations'),
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
