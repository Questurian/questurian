import {
  CLAUDE_MODELS_ENABLED,
  CLAUDE_SUBSCRIPTION_WRITER_ENABLED
} from '../../../shared/api/ai/models'
import type { Prompt2BlogModelName, Prompt2BlogWriterModel } from '../types/pipeline.types'

export const FEATURE_PREFIX = '/prompt2blog'

export type Prompt2BlogModelStackId =
  | 'opus-led-medium'
  | 'opus-led-high'
  | 'opus-led-xhigh'
  | 'opus-led-max'
  | 'sonnet-led-medium'
  | 'sonnet-led-high'
  | 'sonnet-led-xhigh'
  | 'sonnet-led-max'

/**
 * Stack family used by the picker. Opus-led stacks reserve Opus for prose and
 * use Sonnet for judgment; Flash-Lite remains the cheap research worker.
 */
export type Prompt2BlogStackFamily = 'opus' | 'sonnet'

export const PROMPT2BLOG_STACK_FAMILY_LABELS: Record<Prompt2BlogStackFamily, string> = {
  opus: 'Claude Opus',
  sonnet: 'Claude Sonnet'
}

export interface Prompt2BlogModelStack {
  id: Prompt2BlogModelStackId
  family: Prompt2BlogStackFamily
  label: string
  priceTier: string
  speedTier: 'Slowest' | 'Slow' | 'Moderate' | 'Fast' | 'Faster' | 'Fastest'
  description: string
  /**
   * What this stack is for, in terms of the editing burden it tends to leave.
   * The mechanical description says which model fills which role; it does not
   * tell an operator which one to pick, and picking on price alone produced a
   * draft that needed a rewrite rather than an edit.
   */
  guidance: string
  /**
   * Marks the stack offered as the starting point. Exactly one carries it.
   */
  recommended?: boolean
  modelName: Prompt2BlogModelName
  writingModel: Prompt2BlogWriterModel
  auditModel: Prompt2BlogWriterModel
}

type Prompt2BlogStackEffort = 'medium' | 'high' | 'xhigh' | 'max'

/**
 * Effort is the only axis that separates these stacks, so it has to carry the
 * expectation. Wording stays deliberately hedged: the difference between
 * efforts is real but has been observed over a handful of runs, not measured,
 * and a picker that promises quality is a picker that will be wrong.
 */
const STACK_GUIDANCE: Record<Prompt2BlogStackEffort, string> = {
  medium: 'Cheapest and quickest. Use it to try a commission out; expect to restructure sections yourself.',
  high: 'A reasonable default for a routine commission where the shape is already clear.',
  xhigh: 'For commissions with awkward scope or thin evidence, where drafts tend to come back needing work.',
  max: 'Aims for the smallest editing burden. Slowest, and the one to reach for when the draft matters.'
}

export const PROMPT2BLOG_MODEL_STACKS: Prompt2BlogModelStack[] = [
  // Claude owns writing, repair, and judgment. Flash-Lite does only worker
  // tasks, keeping metered spend low. Low effort is intentionally unavailable.
  ...(['medium', 'high', 'xhigh', 'max'] as const).map(effort => ({
    id: `opus-led-${effort}` as Prompt2BlogModelStackId,
    family: 'opus' as const,
    label: `Opus · ${effort === 'xhigh' ? 'XHigh' : effort[0].toUpperCase() + effort.slice(1)}`,
    priceTier: 'Plan + $',
    speedTier: 'Slowest' as const,
    description: `Claude Opus at ${effort} effort writes and repairs; Claude Sonnet at ${effort} judges; fixed medium-effort Sonnet handles planning, fact checks, and titles.`,
    guidance: STACK_GUIDANCE[effort],
    recommended: effort === 'high',
    modelName: 'gemini-3.1-flash-lite' as const,
    writingModel: `claude-opus-5-${effort}` as Prompt2BlogWriterModel,
    auditModel: `claude-sonnet-5-${effort}` as Prompt2BlogWriterModel
  })),
  ...(['medium', 'high', 'xhigh', 'max'] as const).map(effort => ({
    id: `sonnet-led-${effort}` as Prompt2BlogModelStackId,
    family: 'sonnet' as const,
    label: `Sonnet · ${effort === 'xhigh' ? 'XHigh' : effort[0].toUpperCase() + effort.slice(1)}`,
    priceTier: 'Plan + $',
    speedTier: effort === 'medium' ? ('Fast' as const) : ('Moderate' as const),
    description: `Claude Sonnet at ${effort} effort writes, repairs, and judges; Gemini Flash-Lite is reserved for cheap research work.`,
    guidance: STACK_GUIDANCE[effort],
    modelName: 'gemini-3.1-flash-lite' as const,
    writingModel: `claude-sonnet-5-${effort}` as Prompt2BlogWriterModel,
    auditModel: `claude-sonnet-5-${effort}` as Prompt2BlogWriterModel
  }))
]

export const PROMPT2BLOG_STACK_FAMILY_ORDER: Prompt2BlogStackFamily[] = ['opus', 'sonnet']

export const DEFAULT_PROMPT2BLOG_MODEL_STACK_ID: Prompt2BlogModelStackId = 'opus-led-high'

export const PROMPT2BLOG_FIXED_STAGE_MODELS = {
  outline: 'claude-sonnet-5-medium',
  groundedness: 'claude-sonnet-5-medium',
  title: 'claude-sonnet-5-medium',
} as const

export function resolvePrompt2BlogModelStack(value?: string): Prompt2BlogModelStack {
  return (
    PROMPT2BLOG_MODEL_STACKS.find(stack => stack.id === value) ??
    PROMPT2BLOG_MODEL_STACKS.find(stack => stack.id === DEFAULT_PROMPT2BLOG_MODEL_STACK_ID)!
  )
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
  {
    value: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro (Preview — best quality)'
  },
  {
    value: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite (Preview — fast & cheap)'
  },
  {
    value: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash Image (Preview — multimodal)'
  },
  {
    value: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite (Default, fastest)'
  },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Stronger drafting)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Deepest, slowest)' },
  {
    value: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash (Lightweight fallback)'
  }
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
  if (
    CLAUDE_SUBSCRIPTION_WRITER_ENABLED &&
    /^claude-(opus|sonnet)-5-(medium|high|xhigh|max)$/.test(value ?? '')
  ) {
    return value as Prompt2BlogWriterModel
  }
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
