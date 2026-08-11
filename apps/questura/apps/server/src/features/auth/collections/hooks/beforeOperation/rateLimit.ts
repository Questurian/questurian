import { APIError, type CollectionBeforeOperationHook } from 'payload'

import {
  STAFF_FORGOT_PASSWORD_LIMITS,
  STAFF_LOGIN_LIMITS,
  checkStaffAuthRateLimit,
  normalizeStaffEmail,
} from '@/features/auth/lib/staff-auth-rate-limit'

/**
 * Throttle staff credential endpoints.
 *
 * `beforeOperation` is the right stage: Payload runs it as the very first step
 * of both the `login` and `forgotPassword` operations, before the password is
 * ever verified. `beforeLogin` runs only *after* `authenticateLocalStrategy`
 * succeeds, so it cannot see — let alone throttle — a wrong-password attempt.
 *
 * Running inside Payload rather than in `middleware.ts` also keeps this on the
 * Node runtime, where the Redis-backed counter works; Next middleware is Edge
 * by default and `ioredis` cannot run there.
 */
export const staffAuthRateLimitHook: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (operation !== 'login' && operation !== 'forgotPassword') {
    return args
  }

  const scope = operation === 'login' ? 'login' : 'forgot-password'
  const limits = operation === 'login' ? STAFF_LOGIN_LIMITS : STAFF_FORGOT_PASSWORD_LIMITS

  const email = normalizeStaffEmail((args as { data?: { email?: unknown } })?.data?.email)

  const result = await checkStaffAuthRateLimit({
    scope,
    headers: req.headers,
    email,
    limits,
  })

  if (!result.allowed) {
    // 429. The message deliberately says nothing about whether the account
    // exists, so this does not become the enumeration oracle it is guarding.
    throw new APIError(
      `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`,
      429
    )
  }

  return args
}
