/**
 * Whether the Anthropic **API-key** path is funded. It is not, so Claude options
 * stay hidden from these pickers and the defaults point at Google models. The
 * `claude-*` names stay in the unions so saved runs and stored selections still
 * type-check, and the backend substitutes a Google model for them
 * (utils.resolve_effective_model). To restore: fund the account, set
 * ANTHROPIC_MODELS_ENABLED=1 on the backend, and flip this.
 *
 * This is no longer the only way Claude can answer -- see
 * CLAUDE_SUBSCRIPTION_WRITER_ENABLED below -- so it is now specifically about
 * the API key, not about Claude in general.
 */
export const CLAUDE_MODELS_ENABLED = false

/**
 * Whether Claude may be picked as the **writing model** for a Prompt2Blog run,
 * served by the Claude Code CLI the authoring machine is logged into.
 *
 * A different switch from CLAUDE_MODELS_ENABLED above, with a different payer:
 * that one spends Anthropic Console credit against an API key, this one draws
 * the plan holder's own subscription allowance. The backend half is
 * CLAUDE_SUBSCRIPTION_MODELS_ENABLED.
 *
 * Deliberately narrower than app-wide. It reaches the Prompt2Blog writer picker
 * and the Claude-writer run stacks, and nothing else: research and audit stay
 * on Gemini, and the other pipelines' pickers are untouched. Anthropic's terms
 * permit subscription OAuth for the plan holder's own use, not for serving
 * other people's requests, so a deployment serving anyone but the owner must
 * leave the backend switch off -- and then a Claude selection is transparently
 * served by Google exactly as before.
 */
export const CLAUDE_SUBSCRIPTION_WRITER_ENABLED = true

export type EditorAssistModelName = 'claude-opus-4-8' | 'claude-sonnet-5' | 'gemini-3.1-pro-preview'

export const DEFAULT_EDITOR_ASSIST_MODEL: EditorAssistModelName = 'gemini-3.1-pro-preview'

const CLAUDE_EDITOR_ASSIST_OPTIONS: Array<{ value: EditorAssistModelName; label: string }> = [
  {
    value: 'claude-opus-4-8',
    label: 'Claude Opus 4.8 (writer; Evidence Profile runs on Gemini)',
  },
  {
    value: 'claude-sonnet-5',
    label: 'Claude Sonnet 5 (faster, cheaper writer; Evidence Profile runs on Gemini)',
  },
]

export const EDITOR_ASSIST_MODEL_OPTIONS: Array<{ value: EditorAssistModelName; label: string }> = [
  ...(CLAUDE_MODELS_ENABLED ? CLAUDE_EDITOR_ASSIST_OPTIONS : []),
  {
    value: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro (Preview — deep reasoning writer)',
  },
]

/**
 * Models selectable for the editorial stage's block-rewrite editor. Deliberately
 * wider than EditorAssistModelName: `/editor-assist/rewrite-block` takes a
 * free-form `model_name` (see backend `RewriteBlockRequest`) rather than the
 * assist allowlist, and the stage exposes the full picker via EDITOR_MODEL_OPTIONS.
 */
export type EditorBlockRewriteModelName =
  | 'claude-opus-4-8'
  | 'claude-opus-4-7'
  | 'claude-sonnet-5'
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.1-flash-lite-preview'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-2.0-flash'

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
  | 'gemini-3.1-pro-preview'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'

export const DEFAULT_Y2B_WRITER_MODEL: Y2BWriterModel = 'gemini-3.1-pro-preview'

const CLAUDE_Y2B_WRITER_OPTIONS: Array<{ value: Y2BWriterModel; label: string }> = [
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 (premier writer)' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (cheaper, fast writer)' },
]

export const Y2B_WRITER_MODEL_OPTIONS: Array<{ value: Y2BWriterModel; label: string }> = [
  ...(CLAUDE_MODELS_ENABLED ? CLAUDE_Y2B_WRITER_OPTIONS : []),
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview — deep reasoning)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]

/**
 * The six tones the shared catalog ships, mirroring
 * `apps/backend/data/prompt2blog/tones`.
 *
 * Cut from ten on 2026-08-27. `editorial-comparison` duplicated the Comparison
 * article form, `street-smart-nomad` duplicated the safety topic module,
 * `forbes-service-journalism` was Practical Authority with different
 * adjectives, and `inspirational` asked for the register the voice rules ban.
 * `resolve_tone_profile` raises on an unknown id, so this union and that
 * directory have to move together.
 */
export type ArticleToneId =
  | 'practical'
  | 'practical-authority'
  | 'no-fluff-field-guide'
  | 'experienced-traveler'
  | 'editorial'
  | 'aspirational-grounded'

export const DEFAULT_ARTICLE_TONE_ID: ArticleToneId = 'practical'

export const ARTICLE_TONE_OPTIONS: Array<{
  value: ArticleToneId
  label: string
  description: string
}> = [
  { value: 'practical', label: 'Practical', description: 'Neutral default. Answers the question without taking a side.' },
  { value: 'practical-authority', label: 'Practical Authority', description: 'Takes a clear side and says who each option suits.' },
  { value: 'no-fluff-field-guide', label: 'No-Fluff Field Guide', description: 'Operational and blunt. What to do, what to check, what goes wrong.' },
  { value: 'experienced-traveler', label: 'Experienced Traveler', description: 'Observed and lightly first person. Judgment from having watched it.' },
  { value: 'editorial', label: 'Editorial', description: 'Long-form. One argument built across the whole piece.' },
  { value: 'aspirational-grounded', label: 'Aspirational but Grounded', description: 'Makes the case for a place with every claim anchored.' },
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
  // Stored Claude selections fall through to the default while Claude is off.
  if (CLAUDE_MODELS_ENABLED && value === 'claude-sonnet-5') return value
  if (CLAUDE_MODELS_ENABLED && value === 'claude-opus-4-8') return value
  if (value === 'gemini-3.1-pro-preview') return value
  return DEFAULT_EDITOR_ASSIST_MODEL
}
