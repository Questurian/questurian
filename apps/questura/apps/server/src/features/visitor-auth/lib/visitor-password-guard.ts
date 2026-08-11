import { getPasswordStrengthError } from '@/shared/lib/password-strength'

/**
 * Paths whose body sets a *new* password.
 *
 * `/sign-in/email` is deliberately absent: validating there would reject
 * existing visitors whose passwords predate the rule, turning a hardening
 * change into a lockout. Enforcement applies when a password is set, not when
 * one is used.
 */
export const PASSWORD_BEARING_PATHS = new Set([
  '/sign-up/email',
  '/reset-password',
  '/change-password',
  '/set-password',
])

type PasswordBody = {
  password?: unknown
  newPassword?: unknown
} | null | undefined

/**
 * Returns the strength error for a Better Auth request, or `null` when the
 * request either carries no new password or carries an acceptable one.
 *
 * Sign-up sends `password`; reset/change/set send `newPassword`.
 *
 * Kept separate from `better-auth.ts` so it can be tested without constructing
 * a live Better Auth instance (that module opens a database pool at import).
 */
export function getVisitorPasswordError(path: string, body: PasswordBody): string | null {
  if (!PASSWORD_BEARING_PATHS.has(path)) return null

  const candidate = body?.password ?? body?.newPassword

  if (candidate === undefined || candidate === null) return null

  return getPasswordStrengthError(candidate)
}
