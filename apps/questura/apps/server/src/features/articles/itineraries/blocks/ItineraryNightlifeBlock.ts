import { Block } from 'payload'
import { DataNightlifeBlock } from '../../rankings/blocks/DataNightlifeBlock'
import { timeField, durationField } from './utils/timeField'

export const ItineraryNightlifeBlock: Block = {
  ...DataNightlifeBlock,
  slug: 'itinerary-nightlife',
  fields: [
    timeField,
    durationField,
    ...DataNightlifeBlock.fields,
  ],
}
