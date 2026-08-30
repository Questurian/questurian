import { describe, expect, it } from 'vitest'
import { defaultDraftName } from './draft-name'

/**
 * Saving is not "was this good" — it is "do I want this for later", and a
 * failure kept deliberately is how the next failure gets diagnosed. That only
 * works if the kept runs are tellable apart.
 */

const AT = new Date(2026, 7, 30, 14, 5)

describe('the default draft name', () => {
  it('is built from what varies between attempts', () => {
    const name = defaultDraftName({
      formId: 'destination-guide',
      location: 'Medellín',
      models: ['claude-opus-5-high'],
      at: AT,
    })

    expect(name).toBe('Medellín · destination-guide · opus-5 · 2026-08-30 14:05')
  })

  it('tells two runs of the same subject apart', () => {
    // The exact problem: six Medellín runs, all with roughly the same title.
    const first = defaultDraftName({ location: 'Medellín', models: ['claude-opus-5-high'], at: AT })
    const second = defaultDraftName({
      location: 'Medellín',
      models: ['claude-sonnet-5-medium'],
      at: AT,
    })

    expect(first).not.toBe(second)
  })

  it('drops the vendor prefix and the effort suffix', () => {
    // Every row carries the same vendor, so it earns no space in a list.
    expect(defaultDraftName({ models: ['gemini-3.7-flash'], at: AT })).toContain('3.7-flash')
    expect(defaultDraftName({ models: ['claude-sonnet-5-medium'], at: AT })).toContain('sonnet-5')
  })

  it('does not repeat a model used at more than one step', () => {
    const name = defaultDraftName({
      models: ['claude-opus-5-high', 'claude-opus-5-high'],
      at: AT,
    })

    expect(name).toBe('opus-5 · 2026-08-30 14:05')
  })

  it('still names a run that knows almost nothing about itself', () => {
    // The time alone separates two attempts, which is the minimum this owes.
    expect(defaultDraftName({ at: AT })).toBe('2026-08-30 14:05')
  })

  it('never uses the title', () => {
    // The title is the thing that does not vary between attempts, which is
    // why the list was unreadable in the first place.
    const name = defaultDraftName({
      formId: 'destination-guide',
      location: 'Medellín',
      at: AT,
    })

    expect(name).not.toMatch(/where to stay|guide to/i)
  })
})
