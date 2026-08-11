import { describe, expect, it } from 'vitest'

import {
  PASSWORD_MAX_LENGTH,
  getPasswordStrengthError,
  isPasswordStrongEnough,
  validatePasswordRequirements,
} from './password-strength'

describe('password strength rule', () => {
  it('accepts a password meeting every requirement', () => {
    expect(getPasswordStrengthError('Str0ng!pass')).toBeNull()
    expect(isPasswordStrongEnough('Str0ng!pass')).toBe(true)
  })

  it.each([
    ['too short', 'Ab1!c', 'at least 8 characters'],
    ['no uppercase', 'weak1!pass', 'an uppercase letter'],
    ['no number', 'Weak!pass', 'a number'],
    ['no symbol', 'Weak1pass', 'a symbol'],
  ])('rejects a password with %s', (_label, password, expected) => {
    const error = getPasswordStrengthError(password)
    expect(error).not.toBeNull()
    expect(error).toContain(expected)
    expect(isPasswordStrongEnough(password)).toBe(false)
  })

  it('lists every missing requirement at once', () => {
    const error = getPasswordStrengthError('abc')
    expect(error).toContain('at least 8 characters')
    expect(error).toContain('an uppercase letter')
    expect(error).toContain('a number')
    expect(error).toContain('a symbol')
  })

  it('rejects passwords beyond the max length before anything else', () => {
    const tooLong = `A1!${'a'.repeat(PASSWORD_MAX_LENGTH)}`
    expect(getPasswordStrengthError(tooLong)).toContain(
      `at most ${PASSWORD_MAX_LENGTH} characters`
    )
  })

  it('accepts a password exactly at the max length', () => {
    const atLimit = `A1!${'a'.repeat(PASSWORD_MAX_LENGTH - 3)}`
    expect(atLimit).toHaveLength(PASSWORD_MAX_LENGTH)
    expect(getPasswordStrengthError(atLimit)).toBeNull()
  })

  it.each([[undefined], [null], [''], [42], [{}]])(
    'treats %s as a missing password rather than throwing',
    (value) => {
      expect(getPasswordStrengthError(value as unknown)).toBe('Password is required.')
    }
  )

  it('reports individual requirements for UI use', () => {
    expect(validatePasswordRequirements('Weak1pass')).toEqual({
      hasMinLength: true,
      hasMaxLength: true,
      hasNumber: true,
      hasUppercase: true,
      hasSymbol: false,
    })
  })
})
