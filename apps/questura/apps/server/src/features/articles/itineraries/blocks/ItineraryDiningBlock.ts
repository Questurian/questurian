/**
 * Itinerary Dining Block
 * Extends DataDiningBlock with structured time fields
 */

import { Block } from 'payload'
import { DataDiningBlock } from '../../rankings/blocks/DataDiningBlock'
import { timeField, durationField } from './utils/timeField'

export const ItineraryDiningBlock: Block = {
  ...DataDiningBlock,
  slug: 'itinerary-dining',
  fields: [
    timeField,
    durationField,
    ...DataDiningBlock.fields,
  ],
}
