import type { PayloadRequest } from 'payload'

import type { User } from '@/payload-types'

/**
 * Narrows an authenticated principal to a human staff account (ADR-0006).
 *
 * Since machine callers authenticate as `ServiceAccounts`, `req.user` is a
 * union: it is either a person or a machine. Almost every access rule in this
 * codebase asks "what is this user's role", a question only a person has an
 * answer to, so this is the one place that decides which principals count.
 *
 * Returning `null` for a service account is deliberate rather than incidental.
 * A service account has no `role` field, so `user.role === 'admin'` would
 * already be false for one -- but that is an accident of the schema, and an
 * accident stops protecting you the moment someone adds a field. Naming the
 * collection makes the exclusion something you have to undo on purpose.
 *
 * A machine that should be allowed somewhere gets explicit collection access
 * saying so, never a role.
 */
export function staffUser(user: PayloadRequest['user']): User | null {
  if (!user) return null
  return user.collection === 'users' ? (user as User) : null
}
