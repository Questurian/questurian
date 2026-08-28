import { describe, expect, it } from 'vitest'
import {
  PROMPT2BLOG_MODEL_STACKS,
  PROMPT2BLOG_STACK_FAMILY_ORDER,
  DEFAULT_PROMPT2BLOG_MODEL_STACK_ID,
  resolvePrompt2BlogModelStack,
  resolvePrompt2BlogWriterModel
} from './prompt2blog.constants'
import { isPlanAllowanceModel } from './prompt2blog-pricing'

const CLAUDE_STACKS = PROMPT2BLOG_MODEL_STACKS

describe('Claude-writer run stacks', () => {
  it('uses only Flash-Lite for metered work', () => {
    for (const stack of CLAUDE_STACKS) {
      expect(stack.modelName).toBe('gemini-3.1-flash-lite')
      expect(isPlanAllowanceModel(stack.auditModel)).toBe(true)
    }
  })

  it('offers medium through max effort without exposing low', () => {
    expect(PROMPT2BLOG_MODEL_STACKS.map(stack => stack.id)).toEqual([
      'opus-led-medium',
      'opus-led-high',
      'opus-led-xhigh',
      'opus-led-max',
      'sonnet-led-medium',
      'sonnet-led-high',
      'sonnet-led-xhigh',
      'sonnet-led-max'
    ])
    expect(PROMPT2BLOG_MODEL_STACKS.some(stack => stack.id.includes('low'))).toBe(false)
    expect(PROMPT2BLOG_MODEL_STACKS).toHaveLength(8)
  })

  it('gives every stack a family the picker knows how to group', () => {
    for (const stack of PROMPT2BLOG_MODEL_STACKS) {
      expect(PROMPT2BLOG_STACK_FAMILY_ORDER).toContain(stack.family)
    }
  })

  it('groups Opus before Sonnet and orders each by increasing effort', () => {
    expect(PROMPT2BLOG_STACK_FAMILY_ORDER).toEqual(['opus', 'sonnet'])
    expect(PROMPT2BLOG_MODEL_STACKS.map(stack => stack.family)).toEqual([
      'opus',
      'opus',
      'opus',
      'opus',
      'sonnet',
      'sonnet',
      'sonnet',
      'sonnet'
    ])
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

  it('gives every stack guidance about the editing burden it leaves', () => {
    // The mechanical description says which model fills which role. It does not
    // help an operator choose, and choosing on price alone produced a draft
    // that needed a rewrite rather than an edit.
    for (const stack of PROMPT2BLOG_MODEL_STACKS) {
      expect(stack.guidance.length).toBeGreaterThan(0)
      expect(stack.guidance).not.toBe(stack.description)
    }
  })

  it('does not promise a quality outcome it has not measured', () => {
    // Two sampled runs are not evidence for a guarantee.
    const banned = /\bguarantee|\bguaranteed|\bbest quality\b|\bflawless\b|\bperfect\b/i
    for (const stack of PROMPT2BLOG_MODEL_STACKS) {
      expect(banned.test(stack.guidance)).toBe(false)
      expect(banned.test(stack.description)).toBe(false)
    }
  })

  it('recommends exactly one stack, and it is the default', () => {
    const recommended = PROMPT2BLOG_MODEL_STACKS.filter(stack => stack.recommended)

    expect(recommended).toHaveLength(1)
    expect(recommended[0]!.id).toBe(DEFAULT_PROMPT2BLOG_MODEL_STACK_ID)
    // High keeps Opus on the prose stages without making maximum-effort
    // reasoning the default for every article.
    expect(recommended[0]!.id).toBe('opus-led-high')
  })

  it('distinguishes the cheapest stack instead of presenting it as equivalent', () => {
    const cheapest = resolvePrompt2BlogModelStack('opus-led-medium')
    const strongest = resolvePrompt2BlogModelStack('opus-led-max')

    expect(cheapest.guidance).not.toBe(strongest.guidance)
    expect(cheapest.recommended).toBeFalsy()
  })

  it('resolves the writing model every stack names', () => {
    for (const stack of CLAUDE_STACKS) {
      expect(resolvePrompt2BlogWriterModel(stack.writingModel)).toBe(stack.writingModel)
    }
  })

  it('falls a stored selection back to the default rather than failing', () => {
    // A run saved under one configuration has to still open under another.
    expect(resolvePrompt2BlogWriterModel('claude-opus-4-8')).toBe('gemini-3.1-pro-preview')
    expect(resolvePrompt2BlogWriterModel('not-a-model')).toBe('gemini-3.1-pro-preview')
  })
})
