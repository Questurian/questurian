/** Model selection for the itineraries title generator. Runs on Claude (Anthropic);
 * the backend routes `claude*` names to Anthropic via the writer-model router. */
export type ItineraryTitleModelName = 'claude-opus-4-8' | 'claude-opus-4-7' | 'claude-sonnet-5'

export const DEFAULT_ITINERARY_TITLE_MODEL: ItineraryTitleModelName = 'claude-opus-4-8'

export const ITINERARY_TITLE_MODEL_OPTIONS: Array<{
  value: ItineraryTitleModelName
  label: string
}> = [
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (cheaper, fast writer)' },
]

export function resolveItineraryTitleModelName(value?: string): ItineraryTitleModelName {
  if (value === 'claude-opus-4-8') return value
  if (value === 'claude-opus-4-7') return value
  if (value === 'claude-sonnet-5') return value
  return DEFAULT_ITINERARY_TITLE_MODEL
}
