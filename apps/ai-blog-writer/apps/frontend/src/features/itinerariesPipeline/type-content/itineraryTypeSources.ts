import couple from './couple.md?raw'
import cultural from './cultural.md?raw'
import dayNightSocial from './day-night-social.md?raw'
import food from './food.md?raw'
import luxury from './luxury.md?raw'

export type ItineraryPipelineTypeId =
  | 'food'
  | 'couple'
  | 'luxury'
  | 'cultural'
  | 'day-night-social'

export const ITINERARY_PIPELINE_TYPE_OPTIONS: Array<{
  id: ItineraryPipelineTypeId
  label: string
  filename: string
}> = [
  { id: 'food', label: 'Food', filename: 'food.md' },
  { id: 'couple', label: 'Couple', filename: 'couple.md' },
  { id: 'luxury', label: 'Luxury', filename: 'luxury.md' },
  { id: 'cultural', label: 'Cultural', filename: 'cultural.md' },
  { id: 'day-night-social', label: 'Day & night social', filename: 'day-night-social.md' },
]

const MARKDOWN_BY_ID: Record<ItineraryPipelineTypeId, string> = {
  food,
  couple,
  luxury,
  cultural,
  'day-night-social': dayNightSocial,
}

export function getItineraryPipelineTypeMarkdown(id: ItineraryPipelineTypeId): string {
  return MARKDOWN_BY_ID[id]
}
