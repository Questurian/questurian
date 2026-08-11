import { describe, expect, it } from 'vitest'

import { passwordStrengthHook } from './passwordStrength'

function run(data: Record<string, unknown> | null | undefined) {
  return (passwordStrengthHook as (args: { data: unknown }) => unknown)({ data })
}

describe('staff password strength hook', () => {
  it('accepts a strong password', () => {
    const data = { email: 'staff@questurian.com', password: 'Str0ng!pass' }
    expect(run(data)).toBe(data)
  })

  it.each([
    ['short', 'Ab1!c'],
    ['no uppercase', 'weak1!pass'],
    ['no number', 'Weak!pass'],
    ['no symbol', 'Weak1pass'],
  ])('rejects a %s password', (_label, password) => {
    expect(() => run({ email: 'staff@questurian.com', password })).toThrow(/Password must contain/)
  })

  it('ignores writes that carry no password at all', () => {
    const data = { firstName: 'Ada' }
    expect(() => run(data)).not.toThrow()
    expect(run(data)).toBe(data)
  })

  it('ignores an explicitly undefined password', () => {
    const data = { firstName: 'Ada', password: undefined }
    expect(() => run(data)).not.toThrow()
  })

  it('rejects an empty-string password rather than letting it through', () => {
    expect(() => run({ password: '' })).toThrow(/Password is required/)
  })

  it('tolerates a missing data object', () => {
    expect(() => run(undefined)).not.toThrow()
    expect(() => run(null)).not.toThrow()
  })
})
