import { describe, expect, it } from 'vitest'
import {
  PROMPT2BLOG_MODEL_STACKS,
  PROMPT2BLOG_OFFERED_STACK_IDS,
  PROMPT2BLOG_ROUTE_GROUPS,
  PROMPT2BLOG_STACK_FAMILY_ORDER,
  DEFAULT_PROMPT2BLOG_MODEL_STACK_ID,
  resolveOfferedStackId,
  resolvePrompt2BlogModelStack,
  resolvePrompt2BlogWriterModel
} from './prompt2blog.constants'
import { isPlanAllowanceModel } from './prompt2blog-pricing'

const CLAUDE_STACKS = PROMPT2BLOG_MODEL_STACKS

const CLAUDE_LED_STACKS = PROMPT2BLOG_MODEL_STACKS.filter(
  stack => stack.family !== 'checked'
)

describe('Claude-writer run stacks', () => {
  it('keeps every checking role on the plan for the Claude-led stacks', () => {
    for (const stack of CLAUDE_LED_STACKS) {
      expect(isPlanAllowanceModel(stack.auditModel)).toBe(true)
      expect(isPlanAllowanceModel(stack.groundednessModel)).toBe(true)
      expect(isPlanAllowanceModel(stack.outlineModel)).toBe(true)
      expect(isPlanAllowanceModel(stack.titleModel)).toBe(true)
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
      'sonnet-led-max',
      'gemini-checked-high',
      'gemini-checked-max',
      'gemini-checked-max-repair',
      'flash-checked-high',
      'flash-checked-max-repair'
    ])
    expect(PROMPT2BLOG_MODEL_STACKS.some(stack => stack.id.includes('low'))).toBe(false)
    expect(PROMPT2BLOG_MODEL_STACKS).toHaveLength(13)
  })

  it('gives every stack a family the picker knows how to group', () => {
    for (const stack of PROMPT2BLOG_MODEL_STACKS) {
      expect(PROMPT2BLOG_STACK_FAMILY_ORDER).toContain(stack.family)
    }
  })

  it('groups Opus before Sonnet and orders each by increasing effort', () => {
    expect(PROMPT2BLOG_STACK_FAMILY_ORDER).toEqual(['opus', 'sonnet', 'checked'])
    expect(PROMPT2BLOG_MODEL_STACKS.map(stack => stack.family)).toEqual([
      'opus',
      'opus',
      'opus',
      'opus',
      'sonnet',
      'sonnet',
      'sonnet',
      'sonnet',
      'checked',
      'checked',
      'checked',
      'checked',
      'checked'
    ])
  })

  it('keeps Claude on the two stages that write prose, and nowhere else', () => {
    // The point of the route. Claude drafts and repairs; every stage that
    // reads, checks or scores is a Gemini call, so the judge is not from the
    // family that wrote what it is judging -- and the checking stages, which
    // are more than half a run's tokens, stop drawing plan allowance.
    const checked = resolvePrompt2BlogModelStack('gemini-checked-high')

    expect(isPlanAllowanceModel(checked.writingModel)).toBe(true)
    expect(isPlanAllowanceModel(checked.auditModel)).toBe(false)
    expect(isPlanAllowanceModel(checked.groundednessModel)).toBe(false)
    expect(isPlanAllowanceModel(checked.outlineModel)).toBe(false)
    expect(isPlanAllowanceModel(checked.titleModel)).toBe(false)
  })

  it('offers exactly the routes the picker shows, default first', () => {
    expect(PROMPT2BLOG_OFFERED_STACK_IDS).toEqual([
      'opus-led-high',
      'gemini-checked-high',
      'gemini-checked-max-repair',
      'flash-checked-high',
      'flash-checked-max-repair'
    ])
    expect(PROMPT2BLOG_OFFERED_STACK_IDS[0]).toBe(DEFAULT_PROMPT2BLOG_MODEL_STACK_ID)
  })

  it('groups the picker by who checks the draft, and offers nothing outside a group', () => {
    // Effort is the second-order choice inside a group. Five flat options asked
    // the operator to compare two unrelated axes at once.
    expect(PROMPT2BLOG_ROUTE_GROUPS.map(group => group.label)).toEqual([
      'Claude checks its own draft',
      'Gemini Pro checks — independent reader',
      'Gemini Flash checks — cheapest'
    ])
    // Derived from the groups, so the picker and the validator cannot disagree.
    expect(PROMPT2BLOG_OFFERED_STACK_IDS).toEqual(
      PROMPT2BLOG_ROUTE_GROUPS.flatMap(group => group.ids)
    )
    for (const id of PROMPT2BLOG_OFFERED_STACK_IDS) {
      expect(resolvePrompt2BlogModelStack(id).id).toBe(id)
      expect(resolveOfferedStackId(id)).toBe(id)
    }
  })

  it('gives every offered route a short option label distinct from its full name', () => {
    // The group heading already says who checks, so the option text must not
    // repeat it -- but the full label still has to name the whole route where
    // there is no heading, like a receipt's aria label.
    for (const id of PROMPT2BLOG_OFFERED_STACK_IDS) {
      const stack = resolvePrompt2BlogModelStack(id)
      expect(stack.shortLabel.length).toBeGreaterThan(0)
      expect(stack.shortLabel).not.toContain('checked')
    }
  })

  it('checks on Flash for the cheapest route, and never drafts on it', () => {
    const flash = resolvePrompt2BlogModelStack('flash-checked-high')

    expect(flash.writingModel).toBe('claude-opus-5-high')
    expect(flash.repairModel).toBe('claude-opus-5-high')
    expect(flash.auditModel).toBe('gemini-3.7-flash')
    expect(flash.groundednessModel).toBe('gemini-3.7-flash')
    expect(flash.outlineModel).toBe('gemini-3.7-flash')
    expect(flash.titleModel).toBe('gemini-3.7-flash')
  })

  it('names the weaker checker as a tradeoff rather than only as a saving', () => {
    // A cheaper judge is likelier to pass a claim the evidence does not
    // support, and that is the one failure a reader cannot see.
    for (const id of ['flash-checked-high', 'flash-checked-max-repair'] as const) {
      expect(resolvePrompt2BlogModelStack(id).guidance).toMatch(/weaker|fact-read/i)
    }
  })

  it('spends max effort on the rescue, not on every draft', () => {
    // Repair only fires on a draft that failed, and the run gets one attempt,
    // so this is the single call whose strength decides rescue or hand-back.
    // Max on the draft would be paid on runs that were going to pass.
    const split = resolvePrompt2BlogModelStack('gemini-checked-max-repair')

    expect(split.writingModel).toBe('claude-opus-5-high')
    expect(split.repairModel).toBe('claude-opus-5-max')
  })

  it('repairs on the writing model unless a route says otherwise', () => {
    const splitEffort = ['gemini-checked-max-repair', 'flash-checked-max-repair']
    for (const stack of PROMPT2BLOG_MODEL_STACKS) {
      if (splitEffort.includes(stack.id)) continue
      expect(stack.repairModel).toBe(stack.writingModel)
    }
    for (const id of splitEffort) {
      const stack = resolvePrompt2BlogModelStack(id)
      expect(stack.writingModel).toBe('claude-opus-5-high')
      expect(stack.repairModel).toBe('claude-opus-5-max')
    }
  })

  it('falls a stored route that is no longer offered back to the default', () => {
    // The six unoffered stacks stay defined so an old run record is readable.
    // Restoring one into live state would pin the user to a route the picker
    // cannot show.
    expect(resolveOfferedStackId('gemini-checked-high')).toBe('gemini-checked-high')
    expect(resolveOfferedStackId('opus-led-max')).toBe(DEFAULT_PROMPT2BLOG_MODEL_STACK_ID)
    expect(resolveOfferedStackId(undefined)).toBe(DEFAULT_PROMPT2BLOG_MODEL_STACK_ID)
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
