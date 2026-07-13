export type EditorAssistModelName = 'claude-opus-4-8' | 'claude-sonnet-5'

export const DEFAULT_EDITOR_ASSIST_MODEL: EditorAssistModelName = 'claude-opus-4-8'

export const EDITOR_ASSIST_MODEL_OPTIONS: Array<{ value: EditorAssistModelName; label: string }> = [
  {
    value: 'claude-opus-4-8',
    label: 'Claude Opus 4.8 (writer; Evidence Profile runs on Gemini)',
  },
  {
    value: 'claude-sonnet-5',
    label: 'Claude Sonnet 5 (faster, cheaper writer; Evidence Profile runs on Gemini)',
  },
]

export type Y2BModelName = 'gemini-2.5-flash-lite'

export const DEFAULT_Y2B_MODEL: Y2BModelName = 'gemini-2.5-flash-lite'

export const Y2B_MODEL_OPTIONS: Array<{ value: Y2BModelName; label: string }> = [
  {
    value: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite (base transcript model)',
  },
]

// Writing-quality model for the compose / editorial stages, independent of the
// base transcript model. Backend allowlist: app/shared/writer_models.py.
export type Y2BWriterModel =
  | 'claude-opus-4-8'
  | 'claude-opus-4-7'
  | 'claude-sonnet-5'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'

export const DEFAULT_Y2B_WRITER_MODEL: Y2BWriterModel = 'claude-opus-4-8'

export const Y2B_WRITER_MODEL_OPTIONS: Array<{ value: Y2BWriterModel; label: string }> = [
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 (premier writer)' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (cheaper, fast writer)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]

export type ArticleToneId =
  | 'practical'
  | 'editorial'
  | 'inspirational'
  | 'practical-authority'
  | 'no-fluff-field-guide'
  | 'editorial-comparison'
  | 'experienced-traveler'
  | 'forbes-service-journalism'
  | 'street-smart-nomad'
  | 'aspirational-grounded'

export const DEFAULT_ARTICLE_TONE_ID: ArticleToneId = 'practical'

export const ARTICLE_TONE_OPTIONS: Array<{
  value: ArticleToneId
  label: string
  description: string
}> = [
  { value: 'practical', label: 'Practical', description: 'Clear, actionable, logistics-first.' },
  { value: 'editorial', label: 'Editorial', description: 'Polished publication style with strong flow.' },
  { value: 'inspirational', label: 'Inspirational', description: 'Vivid and motivating while factual.' },
  { value: 'practical-authority', label: 'Practical Authority', description: 'Clear, useful, confident, low-fluff.' },
  { value: 'no-fluff-field-guide', label: 'No-Fluff Field Guide', description: 'Direct, blunt, experience-informed.' },
  { value: 'editorial-comparison', label: 'Editorial Comparison', description: 'Analytical, balanced, opinionated.' },
  { value: 'experienced-traveler', label: 'Experienced Traveler', description: 'Grounded, observational, lightly personal.' },
  { value: 'forbes-service-journalism', label: 'Forbes-Style Service Journalism', description: 'Professional, structured, neutral but decisive.' },
  { value: 'street-smart-nomad', label: 'Street-Smart Nomad', description: 'Realistic, cautionary, slightly blunt.' },
  { value: 'aspirational-grounded', label: 'Aspirational but Grounded', description: 'Inspiring without brochure language.' },
]

export type ToneProfile = {
  id: string
  label: string
  description: string
  instructions: string
  default?: boolean
  order?: number
}

export function resolveEditorAssistModelName(value?: string): EditorAssistModelName {
  if (value === 'claude-sonnet-5') return value
  return DEFAULT_EDITOR_ASSIST_MODEL
}
