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

describe('password strength rule, edges found against the real server', () => {
  // A travel site's readers type in their own alphabets. `[A-Z]` refused
  // `Ünïcødé-🔑-2026!` for having no uppercase letter.
  it.each(['Ünïcødé-🔑-2026!', 'Ωmega-pass-1!', 'Ärger-und-2026!', 'Łódź-miasto-1!'])('counts uppercase in any alphabet: %s', (password) => {
    expect(getPasswordStrengthError(password)).toBeNull()
  })

  it('still needs an uppercase letter of some alphabet', () => {
    expect(getPasswordStrengthError('ünïcødé-🔑-2026!')).toContain('an uppercase letter')
  })

  // No keyboard or password manager produces these; a password that holds one
  // is a paste accident or an attack on whatever stores or compares it.
  it.each([
    ['NUL', 'Abc1!defg\u0000'],
    ['tab', 'Abc1!\tdefg'],
    ['newline', 'Abc1!defg\n'],
    ['escape', 'Abc1!\u001bdefg'],
    ['DEL', 'Abc1!defg\u007f'],
  ])('refuses a %s character', (_label, password) => {
    expect(getPasswordStrengthError(password)).toBe('Password must not contain control characters.')
  })

  it('allows ordinary spaces', () => {
    expect(getPasswordStrengthError('Correct Horse 1!')).toBeNull()
  })
})
