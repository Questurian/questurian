import type { Prompt2BlogModelName } from '../types/pipeline.types'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'
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
