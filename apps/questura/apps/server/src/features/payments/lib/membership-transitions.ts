import type { DerivedSubscriptionState } from './subscription-state'

/**
 * Membership emails are decided by what changed on the profile, not by which
 * Stripe event arrived (ADR-0008).
 *
 * Keying off event types meant a duplicate delivery re-sent an email, a stale
 * delivery sent the wrong one, and a single cancellation produced two, because
 * the API call and the webhook both announced it. A transition that did not
 * happen produces nothing, which makes duplicate and out-of-order deliveries
 * free.
 */
export type MembershipSnapshot = {
  subscriptionStatus?: string | null
  cancelAtPeriodEnd?: boolean | null
  paidThroughAt?: string | null
}

export type MembershipTransition =
  | { kind: 'membership_started' }
  | { kind: 'cancellation_scheduled'; endsAt: string | null }
  | { kind: 'reactivated'; renewsAt: string | null }
  | { kind: 'membership_ended'; wasImmediate: boolean }

function isFuture(value: string | null | undefined): boolean {
  if (!value) return false
  const at = new Date(value)
  return !Number.isNaN(at.getTime()) && at > new Date()
}

/**
 * Compare the profile as it was against the state Stripe now reports.
 *
 * Recovery from a failed payment deliberately produces nothing: the visitor
 * never lost access, so telling them their membership just started would be
 * both wrong and alarming.
 */
export function resolveMembershipTransitions(
  before: MembershipSnapshot,
  after: DerivedSubscriptionState
): MembershipTransition[] {
  const transitions: MembershipTransition[] = []

  const wasCancelling = Boolean(before.cancelAtPeriodEnd)
  const previousStatus = before.subscriptionStatus ?? 'none'

  const startedFrom = previousStatus === 'none' || previousStatus === 'cancelled'
  if (startedFrom && after.subscriptionStatus === 'active') {
    transitions.push({ kind: 'membership_started' })
  }

  if (!wasCancelling && after.cancelAtPeriodEnd && after.subscriptionStatus === 'active') {
    transitions.push({ kind: 'cancellation_scheduled', endsAt: after.paidThroughAt })
  }

  if (wasCancelling && !after.cancelAtPeriodEnd && after.subscriptionStatus === 'active') {
    transitions.push({ kind: 'reactivated', renewsAt: after.paidThroughAt })
  }

  // A subscription that ends after the visitor scheduled it was already
  // announced when they cancelled; only an unannounced ending needs an email.
  if (previousStatus !== 'cancelled' && after.subscriptionStatus === 'cancelled' && !wasCancelling) {
    transitions.push({ kind: 'membership_ended', wasImmediate: !isFuture(after.paidThroughAt) })
  }

  return transitions
}
