import { getPayload } from 'payload'

import config from '@/payload.config'
import { normalizeEmail } from './staff-email-guard'

type BetterAuthUser = {
  id: string
  email?: string | null
  name?: string | null
}

function splitDisplayName(name: string | null | undefined): { firstName: string; lastName: string } {
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

export async function ensureVisitorProfileForAuthUser(user: BetterAuthUser) {
  const existing = await findVisitorProfileByAuthUserId(user.id)
  if (existing) return existing

  const payload = await getPayload({ config })
  const { firstName, lastName } = splitDisplayName(user.name)

  return payload.create({
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
}
