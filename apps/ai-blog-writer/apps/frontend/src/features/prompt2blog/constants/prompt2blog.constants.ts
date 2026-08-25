import {
  CLAUDE_MODELS_ENABLED,
  CLAUDE_SUBSCRIPTION_WRITER_ENABLED,
} from '../../../shared/api/ai/models'
import type { Prompt2BlogModelName, Prompt2BlogWriterModel } from '../types/pipeline.types'

export const FEATURE_PREFIX = '/prompt2blog'

export type Prompt2BlogModelStackId =
  | 'maximum-quality'
  | 'premium-review'
  | 'editorial-premium'
  | 'balanced'
  | 'best-value'
  | 'economy'
  | 'opus-max'
  | 'opus-balanced'
  | 'opus-lean'
  | 'sonnet-max'
  | 'sonnet-balanced'
  | 'sonnet-lean'

/**
 * Which family a stack belongs to, so the picker can group them. The two are
 * not points on one scale: an all-Gemini stack bills per token, and a
 * Claude-writer stack pays for its writing out of the subscription, so sorting
 * them into one price-ordered list would compare things that are not
 * comparable.
 */
export type Prompt2BlogStackFamily = 'gemini' | 'claude-writer'

export const PROMPT2BLOG_STACK_FAMILY_LABELS: Record<Prompt2BlogStackFamily, string> = {
  gemini: 'Gemini — billed per token',
  'claude-writer': 'Claude writes — included in your plan',
}

export interface Prompt2BlogModelStack {
  id: Prompt2BlogModelStackId
  family: Prompt2BlogStackFamily
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
    family: 'gemini',
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
    family: 'gemini',
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
    family: 'gemini',
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
    family: 'gemini',
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
    family: 'gemini',
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
    family: 'gemini',
    label: 'Fastest',
    priceTier: '$',
    speedTier: 'Fastest',
    description: 'Flash-Lite handles everything. Fastest and cheapest, with less refinement.',
    modelName: 'gemini-3.1-flash-lite',
    writingModel: 'gemini-3.1-flash-lite',
    auditModel: 'gemini-3.1-flash-lite',
  },
  // A 2x3 grid, on purpose. Two writers across three research-and-audit tiers,
  // so comparing two runs isolates one variable: if Opus + Lean beats
  // Sonnet + Max the writer matters more than the research, and if they tie
  // there is no reason to keep paying for Pro research. The six Gemini stacks
  // above stay untouched as the control group.
  //
  // Research and audit stay on Gemini in every one of them. Claude writes; the
  // grunt work does not move.
  //
  // The price tier reads "Plan + $" because only part of the run is metered:
  // the writing draws the subscription's allowance and has no per-token rate,
  // and the dollars count the Gemini research and audit alone.
  {
    id: 'opus-max',
    family: 'claude-writer',
    label: 'Opus · Max',
    priceTier: 'Plan + $$$',
    speedTier: 'Slowest',
    description: 'Claude Opus writes; Gemini 3.1 Pro researches and judges. The most thorough combination, and the slowest.',
    modelName: 'gemini-3.1-pro-preview',
    writingModel: 'claude-opus-5',
    auditModel: 'gemini-3.1-pro-preview',
  },
  {
    id: 'opus-balanced',
    family: 'claude-writer',
    label: 'Opus · Balanced',
    priceTier: 'Plan + $$',
    speedTier: 'Slow',
    description: 'Claude Opus writes; Gemini 3.7 Flash researches and judges. The default Claude stack.',
    modelName: 'gemini-3.7-flash',
    writingModel: 'claude-opus-5',
    auditModel: 'gemini-3.7-flash',
  },
  {
    id: 'opus-lean',
    family: 'claude-writer',
    label: 'Opus · Lean',
    priceTier: 'Plan + $',
    speedTier: 'Moderate',
    description: 'Claude Opus writes on the cheapest research available. Tests how much the research tier actually matters.',
    modelName: 'gemini-3.1-flash-lite',
    writingModel: 'claude-opus-5',
    auditModel: 'gemini-3.7-flash',
  },
  {
    id: 'sonnet-max',
    family: 'claude-writer',
    label: 'Sonnet · Max',
    priceTier: 'Plan + $$$',
    speedTier: 'Slow',
    description: 'Claude Sonnet writes; Gemini 3.1 Pro researches and judges. The best research a faster writer can be given.',
    modelName: 'gemini-3.1-pro-preview',
    writingModel: 'claude-sonnet-5',
    auditModel: 'gemini-3.1-pro-preview',
  },
  {
    id: 'sonnet-balanced',
    family: 'claude-writer',
    label: 'Sonnet · Balanced',
    priceTier: 'Plan + $$',
    speedTier: 'Moderate',
    description: 'Claude Sonnet writes; Gemini 3.7 Flash researches and judges. The quickest Claude stack worth comparing.',
    modelName: 'gemini-3.7-flash',
    writingModel: 'claude-sonnet-5',
    auditModel: 'gemini-3.7-flash',
  },
  {
    id: 'sonnet-lean',
    family: 'claude-writer',
    label: 'Sonnet · Lean',
    priceTier: 'Plan + $',
    speedTier: 'Fast',
    description: 'Claude Sonnet writes on the cheapest research available. The floor of the grid.',
    modelName: 'gemini-3.1-flash-lite',
    writingModel: 'claude-sonnet-5',
    auditModel: 'gemini-3.7-flash',
  },
]

export const PROMPT2BLOG_STACK_FAMILY_ORDER: Prompt2BlogStackFamily[] = [
  'gemini',
  'claude-writer',
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

/**
 * Offered when the subscription path is on. The two current models are the ones
 * the CLI transport has aliases for and the ones the run stacks use; the older
 * point releases stay out of the picker rather than being offered as choices
 * nobody has a reason to make.
 */
export function resolvePrompt2BlogWriterModel(value?: string): Prompt2BlogWriterModel {
  // Stored Claude selections fall through to the default while no Claude path
  // is on, so a run saved under one configuration still opens under another.
  if (CLAUDE_SUBSCRIPTION_WRITER_ENABLED && value === 'claude-opus-5') return value
  if (CLAUDE_SUBSCRIPTION_WRITER_ENABLED && value === 'claude-sonnet-5') return value
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
