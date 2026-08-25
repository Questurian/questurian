import { describe, expect, it } from 'vitest'
import type { Prompt2BlogInputOption } from '../api'
import { findDefaultOption } from './option-defaults'

const option = (id: string, isDefault = false): Prompt2BlogInputOption => ({
  id,
  label: id,
  default: isDefault,
})

describe('findDefaultOption', () => {
  it('prefers the option that declares itself the default', () => {
    expect(findDefaultOption([option('a'), option('b', true)])).toBe('b')
  })

  it('falls back to the first option', () => {
    expect(findDefaultOption([option('a'), option('b')])).toBe('a')
  })

  it('returns an empty id rather than undefined for an empty list', () => {
    expect(findDefaultOption([])).toBe('')
  })
})
