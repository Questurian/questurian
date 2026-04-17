import { Block } from 'payload'
import { createLocationFilter } from './utils/locationFilter'
import { createItineraryItemMediaFields } from './utils/itemMedia'

export const ItineraryAccommodationsBlock: Block = {
  slug: 'itinerary-accommodations',
  labels: {
    singular: 'Accommodation Stop',
    plural: 'Accommodation Stops',
  },
  fields: [
    {
      name: 'item',
      type: 'relationship',
      relationTo: 'accommodations',
      required: true,
      filterOptions: createLocationFilter('accommodations'),
      admin: {
        description: 'Select an accommodations listing for this itinerary timeslot',
      },
    },
    ...createItineraryItemMediaFields('accommodations'),
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
