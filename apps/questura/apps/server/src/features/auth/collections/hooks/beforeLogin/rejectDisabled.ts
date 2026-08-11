import { APIError } from 'payload'
import type { CollectionBeforeLoginHook } from 'payload'

import { isDisabledStaff } from '../../../lib/staff-status'

/**
 * Refuses a token to a disabled account (ADR-0007).
 *
 * Payload runs `beforeLogin` after the password has already been verified and
 * before `jwtSign`, so throwing here denies the token without telling an
 * anonymous guesser anything: only a caller who already presented the correct
 * password ever sees this message.
 *
 * This blocks *new* sessions. Existing ones are revoked separately, by
 * `revokeSessionsOnDisableHook` clearing `sessions` on the row.
 */
export const rejectDisabledLoginHook: CollectionBeforeLoginHook = async ({ user }) => {
  if (isDisabledStaff(user as { status?: string | null })) {
    throw new APIError('This account has been disabled. Contact an administrator.', 401)
  }

  return user
}
