import { describe, expect, it } from 'vitest'
import { PROMPT2BLOG_MODEL_STACKS } from './prompt2blog.constants'
import {
  estimatePrompt2BlogStackPrice,
  formatPerMillionRate,
  isPlanAllowanceModel,
  type Prompt2BlogModelStackShape
} from './prompt2blog-pricing'

const stackById = (id: string) =>
  PROMPT2BLOG_MODEL_STACKS.find(stack => stack.id === id)!

describe('estimatePrompt2BlogStackPrice', () => {
  it('keeps input and output rates visible instead of hiding their difference', () => {
    const estimate = estimatePrompt2BlogStackPrice(stackById('gemini-checked-high'))

    expect(formatPerMillionRate(estimate.inputPerMillion)).toBe('$2.00')
    expect(formatPerMillionRate(estimate.outputPerMillion)).toBe('$12.00')
  })

  // The estimator used to throw on any model with no rate, which crashed the
  // whole routing panel over a price label. The loud failure moved here, where
  // it belongs: a registered stack naming a metered model with no recorded rate
  // fails this test rather than the app.
  it('has a recorded rate for every metered model on every registered stack', () => {
    for (const stack of PROMPT2BLOG_MODEL_STACKS) {
      expect(estimatePrompt2BlogStackPrice(stack).unratedRoles).toEqual([])
    }
  })

  it('quotes no rate for a Claude role rather than inventing one', () => {
    // Claude calls draw a plan allowance, so there is no dollar-per-million
    // figure that could be quoted honestly.
    const claudeWriter: Prompt2BlogModelStackShape = {
      writingModel: 'claude-opus-4-8',
      repairModel: 'gemini-3.7-flash',
      auditModel: 'gemini-3.7-flash',
      groundednessModel: 'gemini-3.7-flash',
      outlineModel: 'gemini-3.7-flash'
    }

    const estimate = estimatePrompt2BlogStackPrice(claudeWriter)

    expect(estimate.planRoles).toEqual(['writingModel'])
    expect(estimate.unratedRoles).toEqual([])
    // Averaged over the roles that are metered, not diluted by treating the
    // unpriced writer as free.
    expect(formatPerMillionRate(estimate.inputPerMillion)).toBe('$0.75')
    expect(formatPerMillionRate(estimate.outputPerMillion)).toBe('$3.75')
  })

  it('reports no rate at all when every role is on the plan', () => {
    // Which is what every Claude-led route now is. The worker model used to
    // carry a Gemini rate into this answer, so a route whose every real call
    // draws plan allowance still advertised a dollar figure.
    const estimate = estimatePrompt2BlogStackPrice(stackById('opus-led-medium'))

    expect(estimate.mixedPerMillion).toBeNull()
    expect(formatPerMillionRate(estimate.mixedPerMillion)).toBe('—')
    expect(estimate.planRoles).toHaveLength(5)
  })

  it('prices the Gemini-checked route from its three checking roles', () => {
    const estimate = estimatePrompt2BlogStackPrice(stackById('gemini-checked-high'))

    // Only the draft and the repair stay on the plan.
    expect(estimate.planRoles).toEqual(['writingModel', 'repairModel'])
    expect(estimate.mixedPerMillion).toBeCloseTo(4.00, 2)
  })

  it('prices the max-repair route identically, because only effort changed', () => {
    // Both prose stages stay on the plan either way, so the metered half of
    // the route is the same three Gemini calls. What the split costs is plan
    // allowance on the runs that actually repair, which no per-token rate can
    // express -- so the rate must not imply the two routes differ in dollars.
    const high = estimatePrompt2BlogStackPrice(stackById('gemini-checked-high'))
    const maxRepair = estimatePrompt2BlogStackPrice(
      stackById('gemini-checked-max-repair'),
    )

    expect(maxRepair.mixedPerMillion).toBeCloseTo(high.mixedPerMillion!, 6)
    expect(maxRepair.planRoles).toEqual(['writingModel', 'repairModel'])
  })

  it('never prices the research worker, which v3 does not call', () => {
    // `state["model_name"]` reaches the run record and nothing else. It used to
    // carry the heaviest weight in this estimate.
    const workerOnlyDifference: Prompt2BlogModelStackShape = {
      writingModel: 'claude-opus-4-8',
      repairModel: 'claude-opus-4-8',
      auditModel: 'claude-sonnet-5',
      groundednessModel: 'claude-sonnet-5',
      outlineModel: 'claude-sonnet-5'
    }

    expect(estimatePrompt2BlogStackPrice(workerOnlyDifference).mixedPerMillion)
      .toBeNull()
  })

  it('does not mistake a Gemini model for a plan model', () => {
    expect(isPlanAllowanceModel('gemini-3.7-flash')).toBe(false)
    expect(isPlanAllowanceModel('claude-opus-4-8')).toBe(true)
  })
})
