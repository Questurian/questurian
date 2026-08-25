import { describe, expect, it } from 'vitest'
import {
  PROMPT2BLOG_MODEL_STACKS,
  PROMPT2BLOG_STACK_FAMILY_ORDER,
  resolvePrompt2BlogModelStack,
  resolvePrompt2BlogWriterModel,
} from './prompt2blog.constants'
import { isPlanAllowanceModel } from './prompt2blog-pricing'

const CLAUDE_STACKS = PROMPT2BLOG_MODEL_STACKS.filter(
  stack => stack.family === 'claude-writer',
)

describe('Claude-writer run stacks', () => {
  it('is a 2x3 grid: two writers across three research tiers', () => {
    // The grid shape is the point. Comparing two runs is only informative when
    // exactly one thing differs between them, so every writer must appear
    // against every research tier.
    const grid = CLAUDE_STACKS.map(stack => [stack.writingModel, stack.modelName])

    expect(grid).toEqual([
      ['claude-opus-5', 'gemini-3.1-pro-preview'],
      ['claude-opus-5', 'gemini-3.7-flash'],
      ['claude-opus-5', 'gemini-3.1-flash-lite'],
      ['claude-sonnet-5', 'gemini-3.1-pro-preview'],
      ['claude-sonnet-5', 'gemini-3.7-flash'],
      ['claude-sonnet-5', 'gemini-3.1-flash-lite'],
    ])
  })

  it('never puts Claude on research or audit', () => {
    // Not a UI convention. Claude writes and Gemini does the rest; a stack that
    // quietly moved the grunt work onto the subscription would spend the
    // owner's plan allowance on work it was never meant to do.
    for (const stack of PROMPT2BLOG_MODEL_STACKS) {
      expect(isPlanAllowanceModel(stack.modelName)).toBe(false)
      expect(isPlanAllowanceModel(stack.auditModel)).toBe(false)
    }
  })

  it('leaves the Gemini control group untouched', () => {
    const gemini = PROMPT2BLOG_MODEL_STACKS.filter(stack => stack.family === 'gemini')

    expect(gemini.map(stack => stack.id)).toEqual([
      'maximum-quality',
      'premium-review',
      'editorial-premium',
      'balanced',
      'best-value',
      'economy',
    ])
    expect(gemini.every(stack => !isPlanAllowanceModel(stack.writingModel))).toBe(true)
  })

  it('gives every stack a family the picker knows how to group', () => {
    for (const stack of PROMPT2BLOG_MODEL_STACKS) {
      expect(PROMPT2BLOG_STACK_FAMILY_ORDER).toContain(stack.family)
    }
  })

  it('has a unique id per stack', () => {
    const ids = PROMPT2BLOG_MODEL_STACKS.map(stack => stack.id)

    expect(new Set(ids).size).toBe(ids.length)
    // resolvePrompt2BlogModelStack looks a stack up by id, so a duplicate would
    // make one of them unreachable rather than fail loudly.
    for (const id of ids) {
      expect(resolvePrompt2BlogModelStack(id).id).toBe(id)
    }
  })

  it('resolves the writing model every stack names', () => {
    for (const stack of CLAUDE_STACKS) {
      expect(resolvePrompt2BlogWriterModel(stack.writingModel)).toBe(stack.writingModel)
    }
  })

  it('falls a stored selection back to the default rather than failing', () => {
    // A run saved under one configuration has to still open under another.
    expect(resolvePrompt2BlogWriterModel('claude-opus-4-8')).toBe(
      'gemini-3.1-pro-preview',
    )
    expect(resolvePrompt2BlogWriterModel('not-a-model')).toBe('gemini-3.1-pro-preview')
  })
})
