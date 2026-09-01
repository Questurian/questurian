interface VertexTokenRate {
  input: number
  output: number
}

export type Prompt2BlogRoleKey =
  | 'writingModel'
  | 'repairModel'
  | 'auditModel'
  | 'groundednessModel'
  | 'outlineModel'

/**
 * Just the role assignments a v3 run actually calls. Narrower than
 * `Prompt2BlogModelStack` on purpose: pricing reads model names and nothing
 * else, and the role unions differ per role, so a plain string map is what this
 * function actually needs.
 *
 * `modelName` -- the research worker -- is deliberately absent. V3 never calls
 * it; `state["model_name"]` reaches nothing but the run record. It used to
 * carry the single heaviest weight here, so the headline rate was four
 * elevenths a price for work that never happened, and the three checking roles
 * that do run were not priced at all.
 */
export type Prompt2BlogModelStackShape = Record<Prompt2BlogRoleKey, string>

export interface Prompt2BlogStackPriceEstimate {
  /**
   * Blended $/1M across the roles that have a per-token rate. Null when no role
   * on the stack has one, which is the honest answer rather than zero.
   */
  mixedPerMillion: number | null
  inputPerMillion: number | null
  outputPerMillion: number | null
  /**
   * Roles served out of a Claude plan allowance. These cannot have a
   * $/1M rate — the calls draw plan usage rather than billing per token — so
   * inventing one would be a fabricated number, not an estimate.
   */
  planRoles: Prompt2BlogRoleKey[]
  /**
   * Roles on a metered model that has no rate recorded here. Always empty in
   * practice; a stack that lands one is a missing table entry, and
   * `prompt2blog-pricing.test.ts` fails on it. It is a list rather than a throw
   * because the alternative was crashing the whole routing panel over a price
   * label.
   */
  unratedRoles: Prompt2BlogRoleKey[]
}

// Standard global PayGo rates in USD per 1M tokens, checked 2026-08-24.
// Gemini 3.7 Flash uses introductory pricing through 2026-12-31.
const VERTEX_TOKEN_RATES: Record<string, VertexTokenRate> = {
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
  'gemini-3.7-flash': { input: 0.75, output: 3.75 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
}

/**
 * Share of a run's tokens, measured rather than guessed.
 *
 * Taken from the Medellin run: compose 44,309, repair 57,116, audit 55,913,
 * groundedness 54,887, outline 21,478. That run also spent 16,519 tokens on a
 * title stage, which ADR 0034 deleted -- the seed is the title now, so no call
 * writes one and its share is not part of the basis.
 *
 * Repair is weighted as though it always fires, which on a passing draft it
 * does not. That overstates a repair-heavy route rather than flattering it --
 * the safer direction for a number an operator compares routes with. These are
 * a comparison basis, not a forecast of one run.
 */
const ROLE_WEIGHTS: ReadonlyArray<{ key: Prompt2BlogRoleKey; weight: number }> = [
  { key: 'writingModel', weight: 18 },
  { key: 'repairModel', weight: 23 },
  { key: 'auditModel', weight: 22 },
  { key: 'groundednessModel', weight: 22 },
  { key: 'outlineModel', weight: 9 },
] as const

export const PROMPT2BLOG_ROLE_LABELS: Record<Prompt2BlogRoleKey, string> = {
  writingModel: 'Article writer',
  repairModel: 'Repair pass',
  auditModel: 'Quality judge',
  groundednessModel: 'Fact checker',
  outlineModel: 'Section planner',
}

const INPUT_TOKEN_SHARE = 0.8
const OUTPUT_TOKEN_SHARE = 1 - INPUT_TOKEN_SHARE

export function isPlanAllowanceModel(model: string): boolean {
  return model.toLowerCase().startsWith('claude')
}

export function estimatePrompt2BlogStackPrice(
  stack: Prompt2BlogModelStackShape,
): Prompt2BlogStackPriceEstimate {
  const planRoles: Prompt2BlogRoleKey[] = []
  const unratedRoles: Prompt2BlogRoleKey[] = []
  let meteredWeight = 0
  let input = 0
  let output = 0

  for (const role of ROLE_WEIGHTS) {
    const model = stack[role.key]
    if (isPlanAllowanceModel(model)) {
      planRoles.push(role.key)
      continue
    }
    const rate = VERTEX_TOKEN_RATES[model]
    if (!rate) {
      unratedRoles.push(role.key)
      continue
    }
    meteredWeight += role.weight
    input += rate.input * role.weight
    output += rate.output * role.weight
  }

  // Averaged over the metered roles only. On an all-Gemini stack that is every
  // role, so those numbers are unchanged; on a mixed stack it answers "what do
  // the metered parts cost" rather than diluting them with a zero.
  if (meteredWeight === 0) {
    return {
      mixedPerMillion: null,
      inputPerMillion: null,
      outputPerMillion: null,
      planRoles,
      unratedRoles,
    }
  }

  const inputPerMillion = input / meteredWeight
  const outputPerMillion = output / meteredWeight

  return {
    inputPerMillion,
    outputPerMillion,
    mixedPerMillion:
      inputPerMillion * INPUT_TOKEN_SHARE + outputPerMillion * OUTPUT_TOKEN_SHARE,
    planRoles,
    unratedRoles,
  }
}

export function formatPerMillionRate(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(2)}`
}
