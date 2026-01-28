/**
 * Itinerary Accommodations Block
 * Extends DataAccommodationsBlock with structured time fields
 */

import { Block } from 'payload'
import { DataAccommodationsBlock } from '../../rankings/blocks/DataAccommodationsBlock'
import { timeField, durationField } from './utils/timeField'

export const ItineraryAccommodationsBlock: Block = {
  ...DataAccommodationsBlock,
  slug: 'itinerary-accommodations',
  fields: [
    timeField,
    durationField,
    ...DataAccommodationsBlock.fields,
  ],
}
