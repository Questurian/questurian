import type { CollectionAfterChangeHook } from 'payload'

import { logger } from '@/shared/utils/logger'

/**
 * Fields that decide whether someone is a paying member, or where their money
 * goes. Everything else on the profile is support data.
 */
const MEMBERSHIP_FIELDS = [
  'authUserId',
  'billingEmail',
  'subscriptionStatus',
  'paidThroughAt',
  'dunningGraceUntil',
  'cancelAtPeriodEnd',
  'stripeCustomerId',
  'stripeSubscriptionId',
  'affiliateReferralId',
  'affiliateReferredAt',
] as const

function changedMembershipFields(
  doc: Record<string, unknown>,
  previous: Record<string, unknown> | undefined
): string[] {
  if (!previous) return []

  return MEMBERSHIP_FIELDS.filter((field) => {
    const before = previous[field] ?? null
    const after = doc[field] ?? null

    // Dates arrive as `Date` from one path and as an ISO string from another,
    // so compare their serialised form rather than their identity.
    const normalise = (value: unknown) => (value instanceof Date ? value.toISOString() : value)

    return normalise(before) !== normalise(after)
  })
}

/**
 * Record membership and billing changes made by a person.
 *
 * Granting a membership by hand is still allowed — an admin refunding, or
 * fixing a Stripe outage, needs it — but the collection keeps no history, so
 * without this a hand-written `paidThroughAt` is indistinguishable from one
 * Stripe paid for. Field access already limits who can do it; this records
 * that they did.
 *
 * Only writes carrying an authenticated principal are logged. Stripe resync,
 * checkout and the reconciler run through the Local API with no `req.user`,
 * and they already log their own writes; logging them here would bury the
 * hand edits in machine noise, which is the opposite of an audit trail.
 */
export const logMembershipFieldEdits: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation !== 'update') return doc
  if (!req?.user) return doc

  const changed = changedMembershipFields(
    doc as Record<string, unknown>,
    previousDoc as Record<string, unknown> | undefined
  )

  if (changed.length === 0) return doc

  logger.warn('Membership fields changed by a staff account', {
    profileId: (doc as { id?: unknown }).id,
    actorId: req.user.id,
    actorCollection: req.user.collection,
    changedFields: changed,
    subscriptionStatus: (doc as { subscriptionStatus?: unknown }).subscriptionStatus,
    paidThroughAt: (doc as { paidThroughAt?: unknown }).paidThroughAt,
  })

  return doc
}
