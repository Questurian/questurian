import adventure from './adventure.md?raw'
import budget from './budget.md?raw'
import couple from './couple.md?raw'
import cultural from './cultural.md?raw'
import dayNightSocial from './day-night-social.md?raw'
import firstTime from './first-time.md?raw'
import food from './food.md?raw'
import luxury from './luxury.md?raw'
import neighborhood from './neighborhood.md?raw'
import relaxed from './relaxed.md?raw'
import solo from './solo.md?raw'

export type ItineraryPipelineTypeId =
  | 'food'
  | 'solo'
  | 'couple'
  | 'budget'
  | 'luxury'
  | 'adventure'
  | 'relaxed'
  | 'cultural'
  | 'day-night-social'
  | 'first-time'
  | 'neighborhood'

export const ITINERARY_PIPELINE_TYPE_OPTIONS: Array<{
  id: ItineraryPipelineTypeId
  label: string
  filename: string
}> = [
  { id: 'food', label: 'Food', filename: 'food.md' },
  { id: 'solo', label: 'Solo', filename: 'solo.md' },
  { id: 'couple', label: 'Couples / Romantic', filename: 'couple.md' },
  { id: 'budget', label: 'Budget', filename: 'budget.md' },
  { id: 'luxury', label: 'Luxury', filename: 'luxury.md' },
  { id: 'adventure', label: 'Adventure', filename: 'adventure.md' },
  { id: 'relaxed', label: 'Relaxed / Slow travel', filename: 'relaxed.md' },
  { id: 'cultural', label: 'Cultural', filename: 'cultural.md' },
  { id: 'day-night-social', label: 'Day-to-night', filename: 'day-night-social.md' },
  { id: 'first-time', label: 'First-time visitor', filename: 'first-time.md' },
  { id: 'neighborhood', label: 'Neighborhood guide', filename: 'neighborhood.md' },
]

const MARKDOWN_BY_ID: Record<ItineraryPipelineTypeId, string> = {
  food,
  solo,
  couple,
  budget,
  luxury,
  adventure,
  relaxed,
  cultural,
  'day-night-social': dayNightSocial,
  'first-time': firstTime,
  neighborhood,
}

export function getItineraryPipelineTypeMarkdown(id: ItineraryPipelineTypeId): string {
  return MARKDOWN_BY_ID[id]
}
