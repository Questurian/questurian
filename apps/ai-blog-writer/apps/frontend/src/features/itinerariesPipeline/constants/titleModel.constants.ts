import { CLAUDE_MODELS_ENABLED } from '../../../shared/api/ai/models'

/** Model selection for the itineraries title generator. The backend writer-model
 * router sends `claude*` names to Anthropic and `gemini*` names to Vertex. */
export type ItineraryTitleModelName =
  | 'claude-opus-4-8'
  | 'claude-opus-4-7'
  | 'claude-sonnet-5'
  | 'gemini-2.5-pro'

export const DEFAULT_ITINERARY_TITLE_MODEL: ItineraryTitleModelName = 'gemini-2.5-pro'

const CLAUDE_ITINERARY_TITLE_OPTIONS: Array<{
  value: ItineraryTitleModelName
  label: string
}> = [
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (cheaper, fast writer)' },
]

export const ITINERARY_TITLE_MODEL_OPTIONS: Array<{
  value: ItineraryTitleModelName
  label: string
}> = [
  ...(CLAUDE_MODELS_ENABLED ? CLAUDE_ITINERARY_TITLE_OPTIONS : []),
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (deep reasoning)' },
]

export function resolveItineraryTitleModelName(value?: string): ItineraryTitleModelName {
  // Stored Claude selections fall through to the default while Claude is off.
  if (CLAUDE_MODELS_ENABLED && value === 'claude-opus-4-8') return value
  if (CLAUDE_MODELS_ENABLED && value === 'claude-opus-4-7') return value
  if (CLAUDE_MODELS_ENABLED && value === 'claude-sonnet-5') return value
  if (value === 'gemini-2.5-pro') return value
  return DEFAULT_ITINERARY_TITLE_MODEL
}
