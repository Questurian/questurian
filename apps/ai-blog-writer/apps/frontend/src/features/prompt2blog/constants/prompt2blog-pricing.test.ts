import { describe, expect, it } from 'vitest'
import { PROMPT2BLOG_MODEL_STACKS } from './prompt2blog.constants'
import {
  estimatePrompt2BlogStackPrice,
  formatPerMillionRate,
} from './prompt2blog-pricing'

describe('estimatePrompt2BlogStackPrice', () => {
  it('calculates price-ordered blended rates for every stack', () => {
    expect(PROMPT2BLOG_MODEL_STACKS.map(stack => (
      formatPerMillionRate(estimatePrompt2BlogStackPrice(stack).mixedPerMillion)
    ))).toEqual(['$4.00', '$3.04', '$2.55', '$1.35', '$1.04', '$0.50'])
  })

  it('keeps input and output rates visible instead of hiding their difference', () => {
    const editorial = PROMPT2BLOG_MODEL_STACKS.find(
      stack => stack.id === 'editorial-premium',
    )!

    const estimate = estimatePrompt2BlogStackPrice(editorial)

    expect(formatPerMillionRate(estimate.inputPerMillion)).toBe('$1.32')
    expect(formatPerMillionRate(estimate.outputPerMillion)).toBe('$7.50')
  })
})
