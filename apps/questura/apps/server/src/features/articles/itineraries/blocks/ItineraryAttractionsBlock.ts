/**
 * Itinerary Attractions Block
 * Extends DataAttractionsBlock with structured time fields
 */

import { Block } from 'payload'
import { DataAttractionsBlock } from '../../rankings/blocks/DataAttractionsBlock'
import { timeField, durationField } from './utils/timeField'

export const ItineraryAttractionsBlock: Block = {
  ...DataAttractionsBlock,
  slug: 'itinerary-attractions',
  fields: [
    timeField,
    durationField,
    ...DataAttractionsBlock.fields,
  ],
}
