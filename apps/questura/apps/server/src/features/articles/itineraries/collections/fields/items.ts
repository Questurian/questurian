import { Field } from 'payload'
import { ItineraryAccommodationsBlock } from '../../blocks/ItineraryAccommodationsBlock'
import { ItineraryDiningBlock } from '../../blocks/ItineraryDiningBlock'
import { ItineraryAttractionsBlock } from '../../blocks/ItineraryAttractionsBlock'
import { ItineraryNightlifeBlock } from '../../blocks/ItineraryNightlifeBlock'

export const items: Field = {
  name: 'items',
  type: 'blocks',
  minRows: 1,
  blocks: [
    ItineraryAccommodationsBlock,
    ItineraryDiningBlock,
    ItineraryAttractionsBlock,
    ItineraryNightlifeBlock,
  ],
  admin: {
    condition: (_, siblingData) => siblingData?.step1_complete,
    description: 'Add itinerary items in chronological order.',
  },
}

