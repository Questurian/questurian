interface VertexTokenRate {
  input: number
  output: number
}

export type Prompt2BlogRoleKey = 'modelName' | 'writingModel' | 'auditModel'

/**
 * Just the three role assignments. Narrower than `Prompt2BlogModelStack` on
 * purpose: pricing reads model names and nothing else, and the role unions
 * differ per role (only the writer union carries Claude names today), so a
 * plain string map is what this function actually needs.
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

const ROLE_WEIGHTS: ReadonlyArray<{ key: Prompt2BlogRoleKey; weight: number }> = [
  { key: 'modelName', weight: 4 },
  { key: 'writingModel', weight: 5 },
  { key: 'auditModel', weight: 2 },
] as const

export const PROMPT2BLOG_ROLE_LABELS: Record<Prompt2BlogRoleKey, string> = {
  modelName: 'Research worker',
  writingModel: 'Article writer',
  auditModel: 'Quality judge',
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
