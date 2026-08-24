import type { Prompt2BlogModelStack } from './prompt2blog.constants'

interface VertexTokenRate {
  input: number
  output: number
}

export interface Prompt2BlogStackPriceEstimate {
  mixedPerMillion: number
  inputPerMillion: number
  outputPerMillion: number
}

// Standard global PayGo rates in USD per 1M tokens, checked 2026-08-24.
// Gemini 3.7 Flash uses introductory pricing through 2026-12-31.
const VERTEX_TOKEN_RATES: Record<string, VertexTokenRate> = {
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
  'gemini-3.7-flash': { input: 0.75, output: 3.75 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
}

const ROLE_WEIGHTS = [
  { key: 'modelName', weight: 4 },
  { key: 'writingModel', weight: 5 },
  { key: 'auditModel', weight: 2 },
] as const

const INPUT_TOKEN_SHARE = 0.8
const OUTPUT_TOKEN_SHARE = 1 - INPUT_TOKEN_SHARE

export function estimatePrompt2BlogStackPrice(
  stack: Prompt2BlogModelStack,
): Prompt2BlogStackPriceEstimate {
  const totalWeight = ROLE_WEIGHTS.reduce((sum, role) => sum + role.weight, 0)
  const blended = ROLE_WEIGHTS.reduce(
    (total, role) => {
      const model = stack[role.key]
      const rate = VERTEX_TOKEN_RATES[model]
      if (!rate) throw new Error(`Missing Vertex pricing for ${model}`)
      return {
        input: total.input + rate.input * role.weight,
        output: total.output + rate.output * role.weight,
      }
    },
    { input: 0, output: 0 },
  )
  const inputPerMillion = blended.input / totalWeight
  const outputPerMillion = blended.output / totalWeight

  return {
    inputPerMillion,
    outputPerMillion,
    mixedPerMillion:
      inputPerMillion * INPUT_TOKEN_SHARE + outputPerMillion * OUTPUT_TOKEN_SHARE,
  }
}

export function formatPerMillionRate(value: number): string {
  return `$${value.toFixed(2)}`
}
