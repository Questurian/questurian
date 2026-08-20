import { getPayload } from 'payload'

import config from '@/payload.config'
import { normalizeEmail } from '@/shared/lib/normalize-email'

type BetterAuthUser = {
  id: string
  email?: string | null
  name?: string | null
}

export function splitDisplayName(name: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

export async function findVisitorProfileByAuthUserId(authUserId: string) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'visitor-profiles',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      authUserId: { equals: authUserId },
    },
  })

  return result.docs[0] ?? null
}

export async function findVisitorProfileByStripeCustomerId(stripeCustomerId: string) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'visitor-profiles',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      stripeCustomerId: { equals: stripeCustomerId },
    },
  })

  return result.docs[0] ?? null
}

export async function updateVisitorProfileByAuthUserId(
  authUserId: string,
  data: Record<string, unknown>
) {
  const existing = await findVisitorProfileByAuthUserId(authUserId)
  if (!existing) return null

  const payload = await getPayload({ config })
  return payload.update({
    collection: 'visitor-profiles',
    id: existing.id,
    data,
    overrideAccess: true,
  })
}

/**
 * Find the visitor's profile, creating it if this is the first time we see them.
 *
 * Find-then-create is not atomic, and nothing serialises it: two authenticated
 * requests landing together on a visitor who has no profile yet both read
 * nothing and both create. `authUserId` is `unique`, so the second create is
 * refused — correctly, and that is the constraint doing its job.
 *
 * What was wrong is that the refusal propagated. `resolveVisitorPrincipal` calls
 * this on every authenticated request that finds no profile, and a throw there
 * 500s the payments routes; on the client, `useGatedFullArticle` reads any
 * `/api/me` failure as anonymous, so a paying member gets the paywall because
 * two of their own requests raced.
 *
 * The losing create is not an error to report — the row it wanted exists. So a
 * failed create re-reads, and returns the winner's row if one appeared. Any
 * failure that is *not* a lost race leaves the re-read empty and the original
 * error is rethrown unchanged, because the error shape is not sniffed: Payload
 * raises its own `ValidationError` for a duplicate it catches itself and a
 * Postgres `23505` for one the database catches, and guessing which is how
 * `isInvalidRequestError` came to match nothing a real client throws.
 *
 * The window is narrow — sign-up and the OAuth callback already create the
 * profile in an after hook, so this only fires when it is genuinely missing.
 */
export async function ensureVisitorProfileForAuthUser(user: BetterAuthUser) {
  const existing = await findVisitorProfileByAuthUserId(user.id)
  if (existing) return existing

  const payload = await getPayload({ config })
  const { firstName, lastName } = splitDisplayName(user.name)

  try {
    return await payload.create({
      collection: 'visitor-profiles',
      data: {
        authUserId: user.id,
        email: normalizeEmail(user.email),
        firstName,
        lastName,
        subscriptionStatus: 'none',
        cancelAtPeriodEnd: false,
      },
      overrideAccess: true,
    })
  } catch (error) {
    const winner = await findVisitorProfileByAuthUserId(user.id)
    if (winner) return winner

    throw error
  }
}
