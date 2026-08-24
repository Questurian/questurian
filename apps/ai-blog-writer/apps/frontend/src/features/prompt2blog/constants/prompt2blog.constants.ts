import { CLAUDE_MODELS_ENABLED } from '../../../shared/api/ai/models'
import type { Prompt2BlogModelName, Prompt2BlogWriterModel } from '../types/pipeline.types'

export const FEATURE_PREFIX = '/prompt2blog'

export type Prompt2BlogModelStackId =
  | 'maximum-quality'
  | 'premium-review'
  | 'editorial-premium'
  | 'balanced'
  | 'best-value'
  | 'economy'

export interface Prompt2BlogModelStack {
  id: Prompt2BlogModelStackId
  label: string
  priceTier: string
  speedTier: 'Slowest' | 'Slow' | 'Moderate' | 'Fast' | 'Faster' | 'Fastest'
  description: string
  modelName: Prompt2BlogModelName
  writingModel: Prompt2BlogWriterModel
  auditModel: Prompt2BlogWriterModel
}

export const PROMPT2BLOG_MODEL_STACKS: Prompt2BlogModelStack[] = [
  {
    id: 'maximum-quality',
    label: 'Maximum Quality',
    priceTier: '$$$$$$',
    speedTier: 'Slowest',
    description: 'Gemini 3.1 Pro handles every model call. Slowest and most expensive.',
    modelName: 'gemini-3.1-pro-preview',
    writingModel: 'gemini-3.1-pro-preview',
    auditModel: 'gemini-3.1-pro-preview',
  },
  {
    id: 'premium-review',
    label: 'Premium Review',
    priceTier: '$$$$$',
    speedTier: 'Slow',
    description: 'Fast research, with Gemini 3.1 Pro writing and judging the finished work.',
    modelName: 'gemini-3.7-flash',
    writingModel: 'gemini-3.1-pro-preview',
    auditModel: 'gemini-3.1-pro-preview',
  },
  {
    id: 'editorial-premium',
    label: 'Editorial Premium',
    priceTier: '$$$$',
    speedTier: 'Moderate',
    description: 'Gemini 3.1 Pro writes; Gemini 3.7 Flash researches and checks quality.',
    modelName: 'gemini-3.7-flash',
    writingModel: 'gemini-3.1-pro-preview',
    auditModel: 'gemini-3.7-flash',
  },
  {
    id: 'balanced',
    label: 'Fast + Optimal',
    priceTier: '$$$',
    speedTier: 'Fast',
    description: 'Gemini 3.7 Flash runs everything. Best speed without dropping to Lite quality.',
    modelName: 'gemini-3.7-flash',
    writingModel: 'gemini-3.7-flash',
    auditModel: 'gemini-3.7-flash',
  },
  {
    id: 'best-value',
    label: 'Best Value',
    priceTier: '$$',
    speedTier: 'Faster',
    description: 'Flash-Lite prepares sources; Gemini 3.7 Flash protects writing and review quality.',
    modelName: 'gemini-3.1-flash-lite',
    writingModel: 'gemini-3.7-flash',
    auditModel: 'gemini-3.7-flash',
  },
  {
    id: 'economy',
    label: 'Fastest',
    priceTier: '$',
    speedTier: 'Fastest',
    description: 'Flash-Lite handles everything. Fastest and cheapest, with less refinement.',
    modelName: 'gemini-3.1-flash-lite',
    writingModel: 'gemini-3.1-flash-lite',
    auditModel: 'gemini-3.1-flash-lite',
  },
]

export const DEFAULT_PROMPT2BLOG_MODEL_STACK_ID: Prompt2BlogModelStackId = 'editorial-premium'

export function resolvePrompt2BlogModelStack(
  value?: string,
): Prompt2BlogModelStack {
  return PROMPT2BLOG_MODEL_STACKS.find(stack => stack.id === value)
    ?? PROMPT2BLOG_MODEL_STACKS.find(stack => stack.id === DEFAULT_PROMPT2BLOG_MODEL_STACK_ID)!
}

export const DEFAULT_PROMPT2BLOG_MODEL: Prompt2BlogModelName = 'gemini-3.7-flash'

export const PROMPT2BLOG_MODEL_OPTIONS: Array<{
  value: Prompt2BlogModelName
  label: string
}> = [
  { value: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
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
  { value: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview — deep reasoning)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]

export function resolvePrompt2BlogWriterModel(value?: string): Prompt2BlogWriterModel {
  // Stored Claude selections fall through to the default while Claude is off.
  if (CLAUDE_MODELS_ENABLED && value === 'claude-opus-4-8') return value
  if (CLAUDE_MODELS_ENABLED && value === 'claude-opus-4-7') return value
  if (CLAUDE_MODELS_ENABLED && value === 'claude-sonnet-5') return value
  if (value === 'gemini-3.7-flash') return value
  if (value === 'gemini-3.5-flash') return value
  if (value === 'gemini-3.5-flash-lite') return value
  if (value === 'gemini-3.1-flash-lite') return value
  if (value === 'gemini-3.1-pro-preview') return value
  if (value === 'gemini-2.5-pro') return value
  if (value === 'gemini-2.5-flash') return value
  return DEFAULT_PROMPT2BLOG_WRITER_MODEL
}

export function resolvePrompt2BlogModelName(value?: string): Prompt2BlogModelName {
  if (value === 'gemini-3.7-flash') return value
  if (value === 'gemini-3.5-flash') return value
  if (value === 'gemini-3.5-flash-lite') return value
  if (value === 'gemini-3.1-flash-lite') return value
  if (value === 'gemini-3.1-pro-preview') return value
  if (value === 'gemini-3.1-flash-lite-preview') return value
  if (value === 'gemini-3.1-flash-image-preview') return value
  if (value === 'gemini-2.5-flash-lite') return value
  if (value === 'gemini-2.5-flash') return value
  if (value === 'gemini-2.5-pro') return value
  if (value === 'gemini-2.0-flash') return value
  return DEFAULT_PROMPT2BLOG_MODEL
}
