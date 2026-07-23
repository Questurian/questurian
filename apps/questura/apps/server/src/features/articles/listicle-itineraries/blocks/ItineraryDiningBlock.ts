import { Block } from 'payload'
import { angleField } from './utils/angleField'
import { selectionReasonField } from './utils/selectionReasonField'
import { createLocationFilter } from '../../shared/utils/locationFilter'
import { createItineraryItemMediaFields } from './utils/itemMedia'
import { itineraryMomentFields } from './utils/momentFields'

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
    ...itineraryMomentFields,
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
    selectionReasonField,
  ],
}
