import { Block } from 'payload'
import { angleField } from './utils/angleField'
import { createLocationFilter } from './utils/locationFilter'
import { createItineraryItemMediaFields } from './utils/itemMedia'

export const ItineraryAttractionsBlock: Block = {
  slug: 'itinerary-attractions',
  labels: {
    singular: 'Attraction Stop',
    plural: 'Attraction Stops',
  },
  fields: [
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
    ...createItineraryItemMediaFields('attractions'),
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
