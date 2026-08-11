import type { CollectionBeforeOperationHook } from 'payload'
import { staffAuthRateLimitHook } from './rateLimit'

/**
 * All beforeOperation hooks for Users collection.
 *
 * This is the first stage Payload runs on `login` and `forgotPassword`, ahead
 * of any credential check.
 */
export const beforeOperationHooks: CollectionBeforeOperationHook[] = [staffAuthRateLimitHook]
