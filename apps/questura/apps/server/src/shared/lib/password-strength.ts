/**
 * The single server-side password strength rule for this application.
 *
 * Both account systems must enforce the *same* rule against this module:
 * Payload `users` (staff) via a `beforeValidate` collection hook, and Better
 * Auth (visitors) via the `hooks.before` middleware. Duplicating the rule in
 * each half is how the two drift apart.
 *
 * The thresholds mirror the client-side requirements already shown to visitors
 * in `client/src/features/Auth/lib/auth-utils.ts`, so the UI's checklist stays
 * truthful rather than promising rules the server never checked.
 *
 * This is deliberately *not* behind a feature flag. A config flag that is
 * defined and never read is how the gap arose in the first place; a reader
 * would only add a switch that can be turned off.
 *
 * Enforcement is not retroactive: it runs when a password is set or changed, so
 * existing weak passwords survive until their next rotation.
 */

export const PASSWORD_MIN_LENGTH = 8

/** Better Auth rejects anything longer before hashing; keep the halves aligned. */
export const PASSWORD_MAX_LENGTH = 128

const SYMBOL_PATTERN = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/

export type PasswordRequirements = {
  hasMinLength: boolean
  hasMaxLength: boolean
  hasNumber: boolean
  hasUppercase: boolean
  hasSymbol: boolean
}

export function validatePasswordRequirements(password: string): PasswordRequirements {
  return {
    hasMinLength: password.length >= PASSWORD_MIN_LENGTH,
    hasMaxLength: password.length <= PASSWORD_MAX_LENGTH,
    hasNumber: /\d/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasSymbol: SYMBOL_PATTERN.test(password),
  }
}

/**
 * Returns a human-readable reason the password is unacceptable, or `null` when
 * it passes. Callers translate the reason into whatever error their framework
 * expects.
 */
export function getPasswordStrengthError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required.'
  }

  const requirements = validatePasswordRequirements(password)

  if (!requirements.hasMaxLength) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`
  }

  const missing: string[] = []
  if (!requirements.hasMinLength) missing.push(`at least ${PASSWORD_MIN_LENGTH} characters`)
  if (!requirements.hasUppercase) missing.push('an uppercase letter')
  if (!requirements.hasNumber) missing.push('a number')
  if (!requirements.hasSymbol) missing.push('a symbol')

  if (missing.length === 0) return null

  return `Password must contain ${missing.join(', ')}.`
}

export function isPasswordStrongEnough(password: unknown): boolean {
  return getPasswordStrengthError(password) === null
}
