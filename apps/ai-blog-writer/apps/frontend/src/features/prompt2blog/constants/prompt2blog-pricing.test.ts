import { describe, expect, it } from 'vitest'
import { PROMPT2BLOG_MODEL_STACKS } from './prompt2blog.constants'
import {
  estimatePrompt2BlogStackPrice,
  formatPerMillionRate,
  isPlanAllowanceModel,
  type Prompt2BlogModelStackShape
} from './prompt2blog-pricing'

describe('estimatePrompt2BlogStackPrice', () => {
  it('keeps input and output rates visible instead of hiding their difference', () => {
    const stack = PROMPT2BLOG_MODEL_STACKS.find(stack => stack.id === 'opus-led-medium')!

    const estimate = estimatePrompt2BlogStackPrice(stack)

    expect(formatPerMillionRate(estimate.inputPerMillion)).toBe('$0.25')
    expect(formatPerMillionRate(estimate.outputPerMillion)).toBe('$1.50')
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
      modelName: 'gemini-3.7-flash',
      writingModel: 'claude-opus-4-8',
      auditModel: 'gemini-3.7-flash'
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
    const allClaude: Prompt2BlogModelStackShape = {
      modelName: 'claude-sonnet-5',
      writingModel: 'claude-opus-4-8',
      auditModel: 'claude-sonnet-5'
    }

    const estimate = estimatePrompt2BlogStackPrice(allClaude)

    expect(estimate.mixedPerMillion).toBeNull()
    expect(formatPerMillionRate(estimate.mixedPerMillion)).toBe('—')
    expect(estimate.planRoles).toHaveLength(3)
  })

  it('prices Claude-led stacks from their Flash-Lite worker only', () => {
    const led = PROMPT2BLOG_MODEL_STACKS.find(stack => stack.id === 'opus-led-high')!

    const estimate = estimatePrompt2BlogStackPrice(led)

    expect(estimate.planRoles).toEqual(['writingModel', 'auditModel'])
    expect(formatPerMillionRate(estimate.inputPerMillion)).toBe('$0.25')
    expect(formatPerMillionRate(estimate.outputPerMillion)).toBe('$1.50')
  })

  it('does not mistake a Gemini model for a plan model', () => {
    expect(isPlanAllowanceModel('gemini-3.7-flash')).toBe(false)
    expect(isPlanAllowanceModel('claude-opus-4-8')).toBe(true)
  })
})
