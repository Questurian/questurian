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
  | 'gemini-checked-high'
  | 'gemini-checked-max'
  | 'gemini-checked-max-repair'
  | 'flash-checked-high'
  | 'flash-checked-max-repair'

/**
 * Stack family used by the picker. Opus-led stacks reserve Opus for prose and
 * use Sonnet for judgment. `checked` stacks keep Claude only on the two stages
 * that write prose and hand every checking stage to Gemini, so the model that
 * grades the draft is not from the same family that wrote it.
 */
export type Prompt2BlogStackFamily = 'opus' | 'sonnet' | 'checked'

export const PROMPT2BLOG_STACK_FAMILY_LABELS: Record<Prompt2BlogStackFamily, string> = {
  opus: 'Claude Opus',
  sonnet: 'Claude Sonnet',
  checked: 'Claude writes, Gemini checks'
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
  /**
   * The option text in the picker. Short because the group heading above it
   * already says who checks the draft; `label` stays long because it names the
   * whole route in receipts and aria labels, where there is no heading.
   */
  shortLabel: string
  modelName: Prompt2BlogModelName
  writingModel: Prompt2BlogWriterModel
  /**
   * Repair rewrites the whole article, so it is a prose model like the writer
   * -- but it is not the same job. The draft writes into an open space; repair
   * is handed a list of required revisions and has to satisfy them without
   * breaking the rest. A route can therefore spend a different effort tier on
   * the rescue than on the draft.
   */
  repairModel: Prompt2BlogWriterModel
  auditModel: Prompt2BlogWriterModel
  /**
   * The two roles that used to be pinned in the backend and unreachable from
   * a request. Declared per stack now, so a route can move five calls instead
   * of two. Named explicitly rather than inherited from the writer: inheriting
   * is what would let a premium prose model promote every small call to its
   * tier.
   */
  outlineModel: Prompt2BlogWriterModel
  groundednessModel: Prompt2BlogWriterModel
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

/**
 * What the checking roles were pinned to before routes could name them, and
 * what the backend still falls back to when a request omits them. Every
 * Claude-led stack spreads this so its routing is written down rather than
 * implied by an omission.
 */
export const PROMPT2BLOG_FIXED_STAGE_MODELS = {
  outlineModel: 'claude-sonnet-5-medium',
  groundednessModel: 'claude-sonnet-5-medium'
} as const

export const PROMPT2BLOG_MODEL_STACKS: Prompt2BlogModelStack[] = [
  // Claude owns writing, repair, and judgment. Flash-Lite does only worker
  // tasks, keeping metered spend low. Low effort is intentionally unavailable.
  ...(['medium', 'high', 'xhigh', 'max'] as const).map(effort => ({
    id: `opus-led-${effort}` as Prompt2BlogModelStackId,
    family: 'opus' as const,
    label: `Opus · ${effort === 'xhigh' ? 'XHigh' : effort[0].toUpperCase() + effort.slice(1)}`,
    shortLabel: `Opus · ${effort === 'xhigh' ? 'XHigh' : effort[0].toUpperCase() + effort.slice(1)} effort`,
    priceTier: 'Plan + $',
    speedTier: 'Slowest' as const,
    description: `Claude Opus at ${effort} effort writes and repairs; Claude Sonnet at ${effort} judges; fixed medium-effort Sonnet plans the sections and checks the facts.`,
    guidance: STACK_GUIDANCE[effort],
    recommended: effort === 'high',
    modelName: 'gemini-2.5-flash-lite' as const,
    writingModel: `claude-opus-5-${effort}` as Prompt2BlogWriterModel,
    repairModel: `claude-opus-5-${effort}` as Prompt2BlogWriterModel,
    auditModel: `claude-sonnet-5-${effort}` as Prompt2BlogWriterModel,
    ...PROMPT2BLOG_FIXED_STAGE_MODELS
  })),
  ...(['medium', 'high', 'xhigh', 'max'] as const).map(effort => ({
    id: `sonnet-led-${effort}` as Prompt2BlogModelStackId,
    family: 'sonnet' as const,
    label: `Sonnet · ${effort === 'xhigh' ? 'XHigh' : effort[0].toUpperCase() + effort.slice(1)}`,
    shortLabel: `Sonnet · ${effort === 'xhigh' ? 'XHigh' : effort[0].toUpperCase() + effort.slice(1)} effort`,
    priceTier: 'Plan + $',
    speedTier: effort === 'medium' ? ('Fast' as const) : ('Moderate' as const),
    description: `Claude Sonnet at ${effort} effort writes, repairs, and judges; Gemini Flash-Lite is reserved for cheap research work.`,
    guidance: STACK_GUIDANCE[effort],
    modelName: 'gemini-2.5-flash-lite' as const,
    writingModel: `claude-sonnet-5-${effort}` as Prompt2BlogWriterModel,
    repairModel: `claude-sonnet-5-${effort}` as Prompt2BlogWriterModel,
    auditModel: `claude-sonnet-5-${effort}` as Prompt2BlogWriterModel,
    ...PROMPT2BLOG_FIXED_STAGE_MODELS
  })),
  // Claude only where the output is prose a reader will judge: the draft and
  // the repair. Everything that reads, checks or scores is Gemini Pro.
  //
  // Two reasons, and the second matters more than the first. Metered spend is
  // the obvious one -- outline, groundedness and the audit are 53% of a run's
  // tokens (measured on the Medellin run: 21k outline, 55k groundedness, 56k
  // audit of 250k) and none of them produce a sentence anyone reads. The one
  // worth the swap is independence: a Claude draft graded by a Claude judge is
  // marked by a model that shares its blind spots, and the Medellin audit
  // passed prose its own family had written while missing nothing a different
  // reader would have caught.
  ...(['high', 'max'] as const).map(effort => ({
    id: `gemini-checked-${effort}` as Prompt2BlogModelStackId,
    family: 'checked' as const,
    label: `Opus · ${effort === 'max' ? 'Max' : 'High'} · Gemini-checked`,
    shortLabel: `Opus · ${effort === 'max' ? 'Max' : 'High'} effort`,
    priceTier: 'Plan + $$',
    speedTier: 'Slow' as const,
    description: `Claude Opus at ${effort} effort writes and repairs; Gemini 2.5 Pro plans, fact checks, and grades the draft.`,
    guidance:
      'The one to try when Claude-graded drafts keep passing an audit you disagree with. A judge from a different family finds different faults, and the checking stages stop drawing Claude plan usage.',
    modelName: 'gemini-2.5-flash-lite' as const,
    writingModel: `claude-opus-5-${effort}` as Prompt2BlogWriterModel,
    repairModel: `claude-opus-5-${effort}` as Prompt2BlogWriterModel,
    auditModel: 'gemini-2.5-pro' as Prompt2BlogWriterModel,
    outlineModel: 'gemini-2.5-pro' as Prompt2BlogWriterModel,
    groundednessModel: 'gemini-2.5-pro' as Prompt2BlogWriterModel
  })),
  // Max effort where it is conditional, not where it is unavoidable.
  //
  // Max on the draft is paid on every run, including the ones that would have
  // passed anyway. Repair only fires on a draft that failed the audit, and the
  // run gets exactly one attempt -- so this is the single call whose strength
  // decides whether a weak draft is rescued or handed back as needs_revision.
  // It is also the better-shaped job for reasoning effort: repair is handed a
  // list of required revisions and has to satisfy them without breaking the
  // rest, while the draft is writing into an open space.
  //
  // What this cannot fix: repair may not change the commission and the outline
  // is already settled, so max effort here only helps inside the shape the
  // draft chose. A structurally wrong article needs the effort on the draft.
  {
    id: 'gemini-checked-max-repair' as Prompt2BlogModelStackId,
    family: 'checked' as const,
    label: 'Opus · Max repair · Gemini-checked',
    shortLabel: 'Opus · High draft, Max repair',
    priceTier: 'Plan + $$',
    speedTier: 'Slow' as const,
    description:
      'Claude Opus at high effort writes; a failed draft is repaired at max effort; Gemini 2.5 Pro plans, fact checks, and grades.',
    guidance:
      'The one to try when drafts come back close but failing on a listed set of fixes. Spends the heaviest effort only on runs that needed rescuing, and nothing extra on runs that passed.',
    modelName: 'gemini-2.5-flash-lite' as const,
    writingModel: 'claude-opus-5-high' as Prompt2BlogWriterModel,
    repairModel: 'claude-opus-5-max' as Prompt2BlogWriterModel,
    auditModel: 'gemini-2.5-pro' as Prompt2BlogWriterModel,
    outlineModel: 'gemini-2.5-pro' as Prompt2BlogWriterModel,
    groundednessModel: 'gemini-2.5-pro' as Prompt2BlogWriterModel
  },
  // The cheapest route that still writes on Opus: Flash does every check.
  //
  // Flash is roughly a third of Pro's rate, so the metered half of a run drops
  // from about $3.69 to $1.35 per 1M mixed tokens. What is being traded is
  // judgement, and the stage to watch is groundedness: a weaker reader is more
  // likely to wave through a claim the evidence does not actually support,
  // which is the one failure a reader cannot see and an editor cannot catch
  // from the prose. Use it for drafts you will fact-read yourself.
  ...(['high', 'max-repair'] as const).map(variant => ({
    id: `flash-checked-${variant}` as Prompt2BlogModelStackId,
    family: 'checked' as const,
    label: `Opus · ${variant === 'max-repair' ? 'Max repair' : 'High'} · Flash-checked`,
    shortLabel:
      variant === 'max-repair' ? 'Opus · High draft, Max repair' : 'Opus · High effort',
    priceTier: 'Plan + $',
    speedTier: 'Moderate' as const,
    description:
      variant === 'max-repair'
        ? 'Claude Opus at high effort writes; a failed draft is repaired at max effort; Gemini 2.5 Flash plans, fact checks, and grades.'
        : 'Claude Opus at high effort writes and repairs; Gemini 2.5 Flash plans, fact checks, and grades.',
    guidance:
      variant === 'max-repair'
        ? 'The cheapest metered route that still spends heavily on rescuing a failed draft. Read the fact checks yourself: Flash is the weaker reader of the two Gemini options.'
        : 'The cheapest route on this list. Good for drafts you plan to fact-read yourself, since a weaker checker is likelier to pass a claim the evidence does not support.',
    modelName: 'gemini-2.5-flash-lite' as const,
    writingModel: 'claude-opus-5-high' as Prompt2BlogWriterModel,
    repairModel: (variant === 'max-repair'
      ? 'claude-opus-5-max'
      : 'claude-opus-5-high') as Prompt2BlogWriterModel,
    auditModel: 'gemini-2.5-flash' as Prompt2BlogWriterModel,
    outlineModel: 'gemini-2.5-flash' as Prompt2BlogWriterModel,
    groundednessModel: 'gemini-2.5-flash' as Prompt2BlogWriterModel
  }))
]

export const PROMPT2BLOG_STACK_FAMILY_ORDER: Prompt2BlogStackFamily[] = ['opus', 'sonnet', 'checked']

export const DEFAULT_PROMPT2BLOG_MODEL_STACK_ID: Prompt2BlogModelStackId = 'opus-led-high'

/**
 * Whether the creativity control reaches the stage that writes the article.
 *
 * Creativity sets the sampling temperature for the composing stage. Claude
 * models are served here by the Claude Code CLI, which has no temperature
 * flag, so the value is accepted and dropped -- the dial is connected on a
 * Gemini-written draft and inert on a Claude-written one. Derived from the
 * stack rather than hardcoded so it stops warning by itself if a writer that
 * honours temperature is ever selected again.
 */
/**
 * The routes offered in the picker, in the order they are shown.
 *
 * Two, not the whole eight-stack matrix. The matrix was closed deliberately --
 * picking an effort tier off a price label produced drafts that needed
 * rewriting -- and reopening it would undo that. The one axis worth a decision
 * is who checks the draft. The other six stacks stay defined so a saved run
 * that names one is still readable; they are just not offered.
 */
/**
 * The picker's groups, in the order they are shown.
 *
 * Grouped by who checks the draft, because that is the decision. Effort is the
 * second-order choice inside a group, and putting five flat options in one list
 * asked the operator to compare two unrelated axes at once.
 *
 * Not the whole eleven-stack matrix: the matrix was closed deliberately --
 * picking an effort tier off a price label produced drafts that needed
 * rewriting. The unoffered stacks stay defined so an old run record is
 * readable; they are just not choices.
 */
export const PROMPT2BLOG_ROUTE_GROUPS: ReadonlyArray<{
  label: string
  ids: Prompt2BlogModelStackId[]
}> = [
  {
    label: 'Claude checks its own draft',
    ids: ['opus-led-high']
  },
  {
    label: 'Gemini Pro checks — independent reader',
    ids: ['gemini-checked-high', 'gemini-checked-max-repair']
  },
  {
    label: 'Gemini Flash checks — cheapest',
    ids: ['flash-checked-high', 'flash-checked-max-repair']
  }
]

/** Flattened from the groups, so the two cannot disagree about what is offered. */
export const PROMPT2BLOG_OFFERED_STACK_IDS: Prompt2BlogModelStackId[] =
  PROMPT2BLOG_ROUTE_GROUPS.flatMap(group => group.ids)

/**
 * A stack id from storage, narrowed to one the picker can actually show.
 *
 * A saved draft naming a route that is no longer offered falls back to the
 * default rather than resurrecting a stack the picker cannot display or the
 * user cannot switch away from.
 */
export function resolveOfferedStackId(value?: unknown): Prompt2BlogModelStackId {
  return PROMPT2BLOG_OFFERED_STACK_IDS.includes(value as Prompt2BlogModelStackId)
    ? (value as Prompt2BlogModelStackId)
    : DEFAULT_PROMPT2BLOG_MODEL_STACK_ID
}

export function creativityReachesWriter(value?: string): boolean {
  return !resolvePrompt2BlogModelStack(value).writingModel.startsWith('claude-')
}

export function resolvePrompt2BlogModelStack(value?: string): Prompt2BlogModelStack {
  return (
    PROMPT2BLOG_MODEL_STACKS.find(stack => stack.id === value) ??
    PROMPT2BLOG_MODEL_STACKS.find(stack => stack.id === DEFAULT_PROMPT2BLOG_MODEL_STACK_ID)!
  )
}

export const DEFAULT_PROMPT2BLOG_MODEL: Prompt2BlogModelName = 'gemini-2.5-flash'

export const PROMPT2BLOG_MODEL_OPTIONS: Array<{
  value: Prompt2BlogModelName
  label: string
}> = [
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Default, fastest)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Deepest, slowest)' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Lightweight fallback)' }
]

export const DEFAULT_PROMPT2BLOG_WRITER_MODEL: Prompt2BlogWriterModel = 'gemini-2.5-pro'

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
  if (value === 'gemini-2.5-flash') return value
  if (value === 'gemini-2.5-flash-lite') return value
  if (value === 'gemini-2.5-pro') return value
  return DEFAULT_PROMPT2BLOG_WRITER_MODEL
}

export function resolvePrompt2BlogModelName(value?: string): Prompt2BlogModelName {
  if (value === 'gemini-2.0-flash') return value
  return DEFAULT_PROMPT2BLOG_MODEL
}
