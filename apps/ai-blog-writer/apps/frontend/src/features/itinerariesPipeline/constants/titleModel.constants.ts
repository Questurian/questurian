/** Model selection for the itineraries title generator. Runs on Claude (Anthropic);
 * the backend routes `claude*` names to Anthropic via the writer-model router. */
export type ItineraryTitleModelName = 'claude-opus-4-8'

export const DEFAULT_ITINERARY_TITLE_MODEL: ItineraryTitleModelName = 'claude-opus-4-8'

export const ITINERARY_TITLE_MODEL_OPTIONS: Array<{
  value: ItineraryTitleModelName
  label: string
}> = [{ value: 'claude-opus-4-8', label: 'Claude Opus 4.8' }]

export function resolveItineraryTitleModelName(_value?: string): ItineraryTitleModelName {
  return DEFAULT_ITINERARY_TITLE_MODEL
}
