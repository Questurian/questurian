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
  dunningGraceUntil?: string | null
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
 * Whether the profile already had a membership before this event.
 *
 * Both a beginning and an ending hang on this one question, and the internal
 * status cannot answer it alone. `mapStripeStatusToInternal` folds Stripe's
 * `incomplete` into `past_due`, so one label covers both a member whose
 * renewal charge failed and a buyer whose very first charge has not cleared
 * yet — the 3DS/SCA case, where the card is authorised seconds later, or
 * abandoned and expired. Reading that label as dunning got both ends wrong:
 * the buyer's `incomplete → active` looked like a recovery, which is
 * deliberately silent, so nothing welcomed them; and their
 * `incomplete_expired → cancelled` looked like a membership ending, so an
 * expired attempt mailed a farewell for a membership that never existed.
 *
 * Entitlement answers it directly. A real member has paid time behind them:
 * an `active` status, a `paidThroughAt` still in the future, or a dunning
 * grace — which `deriveSubscriptionState` opens only for Stripe's own
 * `past_due`/`unpaid` and never for `incomplete`, and which stays on the
 * profile, expired, for as long as the dunning lasts. A subscription that has
 * never collected a payment has none of the three.
 *
 * `cancelled` is terminal regardless of leftover paid time: the subscription
 * is gone, so the next `active` is a new membership rather than the
 * continuation of one, and a redelivered ending announces nothing.
 */
function hadMembership(before: MembershipSnapshot): boolean {
  const previousStatus = before.subscriptionStatus ?? 'none'

  if (previousStatus === 'cancelled') return false
  if (previousStatus === 'active') return true

  return isFuture(before.paidThroughAt) || Boolean(before.dunningGraceUntil)
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
  const wasMember = hadMembership(before)

  if (!wasMember && after.subscriptionStatus === 'active') {
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
  // An ending is also only news to someone who had a membership to lose, which
  // is what keeps an abandoned first charge — `incomplete_expired`, and so
  // internally `cancelled` — from mailing a farewell to a visitor who never
  // got in.
  if (wasMember && after.subscriptionStatus === 'cancelled' && !wasCancelling) {
    transitions.push({ kind: 'membership_ended', wasImmediate: !isFuture(after.paidThroughAt) })
  }

  return transitions
}
