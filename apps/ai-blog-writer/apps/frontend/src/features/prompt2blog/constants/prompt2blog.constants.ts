import { CLAUDE_MODELS_ENABLED } from '../../../shared/api/ai/models'
import type { Prompt2BlogModelName, Prompt2BlogWriterModel } from '../types/pipeline.types'

export { API_BASE_URL } from '../../../shared/api/client/config'

export const FEATURE_PREFIX = '/prompt2blog'

export const DEFAULT_PROMPT2BLOG_MODEL: Prompt2BlogModelName = 'gemini-2.5-flash-lite'

export const PROMPT2BLOG_MODEL_OPTIONS: Array<{
  value: Prompt2BlogModelName
  label: string
}> = [
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview — best quality)' },
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (Preview — fast & cheap)' },
  { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (Preview — multimodal)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Default, fastest)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Stronger drafting)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Deepest, slowest)' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Lightweight fallback)' },
]

export const DEFAULT_PROMPT2BLOG_WRITER_MODEL: Prompt2BlogWriterModel = 'gemini-3.1-pro-preview'

const CLAUDE_PROMPT2BLOG_WRITER_OPTIONS: Array<{
  value: Prompt2BlogWriterModel
  label: string
}> = [
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 (premier writer)' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (cheaper, fast writer)' },
]

export const PROMPT2BLOG_WRITER_MODEL_OPTIONS: Array<{
  value: Prompt2BlogWriterModel
  label: string
}> = [
  ...(CLAUDE_MODELS_ENABLED ? CLAUDE_PROMPT2BLOG_WRITER_OPTIONS : []),
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview — deep reasoning)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]

export function resolvePrompt2BlogWriterModel(value?: string): Prompt2BlogWriterModel {
  // Stored Claude selections fall through to the default while Claude is off.
  if (CLAUDE_MODELS_ENABLED && value === 'claude-opus-4-8') return value
  if (CLAUDE_MODELS_ENABLED && value === 'claude-opus-4-7') return value
  if (CLAUDE_MODELS_ENABLED && value === 'claude-sonnet-5') return value
  if (value === 'gemini-3.1-pro-preview') return value
  if (value === 'gemini-2.5-pro') return value
  if (value === 'gemini-2.5-flash') return value
  return DEFAULT_PROMPT2BLOG_WRITER_MODEL
}

export function resolvePrompt2BlogModelName(value?: string): Prompt2BlogModelName {
  if (value === 'gemini-3.1-pro-preview') return value
  if (value === 'gemini-3.1-flash-lite-preview') return value
  if (value === 'gemini-3.1-flash-image-preview') return value
  if (value === 'gemini-2.5-flash-lite') return value
  if (value === 'gemini-2.5-flash') return value
  if (value === 'gemini-2.5-pro') return value
  if (value === 'gemini-2.0-flash') return value
  return DEFAULT_PROMPT2BLOG_MODEL
}
