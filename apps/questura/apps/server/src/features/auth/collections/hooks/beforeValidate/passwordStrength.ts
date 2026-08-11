import { APIError, type CollectionBeforeValidateHook } from 'payload'

import { getPasswordStrengthError } from '@/shared/lib/password-strength'

/**
 * Enforce password strength for staff accounts.
 *
 * Payload has no password-strength configuration of its own — `Users.ts` sets
 * no rule, and the only length floor in the codebase belonged to Better Auth's
 * visitor half. Staff, the accounts that can reach the admin panel, had no
 * server-side requirement at all.
 *
 * `beforeValidate` is the interception point that covers every write path that
 * can set a password: `create` (registration and invite), `update` (password
 * change), and crucially `resetPassword`, which runs collection
 * `beforeValidate` hooks before it writes the new password. A `beforeChange`
 * hook would miss the reset path.
 *
 * The rule itself lives in `shared/lib/password-strength` and is shared with
 * the Better Auth half so the two cannot drift.
 */
export const passwordStrengthHook: CollectionBeforeValidateHook = ({ data }) => {
  // Only a write that actually carries a password is our business. Ordinary
  // profile edits leave `password` absent and must pass through untouched.
  if (!data || !('password' in data) || data.password === undefined || data.password === null) {
    return data
  }

  const error = getPasswordStrengthError(data.password)

  if (error) {
    throw new APIError(error, 400)
  }

  return data
}
