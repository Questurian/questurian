import { Block } from 'payload'
import { angleField } from './utils/angleField'
import { selectionReasonField } from './utils/selectionReasonField'
import { createLocationFilter } from '../../shared/utils/locationFilter'
import { createItineraryItemMediaFields } from './utils/itemMedia'
import { itineraryMomentFields } from './utils/momentFields'

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
    ...itineraryMomentFields,
    ...createItineraryItemMediaFields('nightlife'),
    angleField,
    {
      name: 'blurb',
      type: 'richText',
      required: true,
      admin: {
        description: 'Editorial context for this stop',
      },
    },
    selectionReasonField,
  ],
}
