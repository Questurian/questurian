import { APIError, type CollectionBeforeValidateHook } from 'payload'

import { normalizeEmail } from '@/shared/lib/normalize-email'

/**
 * Keep one email from identifying both a Payload Staff identity and a
 * BetterAuth Visitor account (ADR-0004).
 *
 * Visitor auth already checks Payload Users. This is the reverse boundary:
 * every Staff create and changed email checks BetterAuth's owning table using
 * the request's existing DB pool. Unchanged updates skip the query so a legacy
 * collision cannot block unrelated account maintenance.
 */
export const rejectVisitorEmailCollisionHook: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const email = normalizeEmail(data?.email)
  if (!email) return data

  if (operation === 'update' && email === normalizeEmail(originalDoc?.email)) {
    return data
  }

  let exists = false
  try {
    const result = await req.payload.db.pool.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM "visitor_auth_users"
          WHERE LOWER(TRIM("email")) = $1
        ) AS "exists";
      `,
      [email],
    )
    exists = result.rows[0]?.exists === true
  } catch {
    throw new APIError('Unable to verify Staff email ownership.', 503)
  }

  if (exists) {
    throw new APIError('This email already belongs to a Visitor account.', 400)
  }

  return data
}
