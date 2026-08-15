import type Stripe from 'stripe'
import { logger } from '@/shared/utils/logger'
import { convertStripeTimestamp } from './payment-helpers'
import { mapStripeStatusToInternal } from './payment-service'

/**
 * How long paid access survives a failed renewal while Stripe retries the card.
 *
 * Five days is measured, not chosen by taste: in the captured test-clock run
 * (`__fixtures__/membership-lifecycle.events.json`) the charge failed at
 * 09-15 13:10 and Stripe scheduled its first retry for 09-19 20:26, about four
 * days and seven hours later. A shorter grace revokes access before Stripe has
 * even retried once, locking out exactly the visitors that retry recovers.
 */
export const DUNNING_GRACE_DAYS = 5

/**
 * Written onto the Stripe subscription when a charge is fully refunded or
 * disputed. Resync reads this so a later `customer.subscription.deleted`
 * cannot restore `paidThroughAt` from the unpaid period end.
 */
export const ACCESS_REVOKED_METADATA_KEY = 'access_revoked'
export const ACCESS_REVOKED_METADATA_VALUE = 'true'

/**
 * Why access was revoked, and the end of the period the revoked charge bought.
 *
 * A refund and a dispute both stop entitlement, but they do not end the same
 * way. A dispute is money still being contested, so only its resolution may
 * restore access. A refund covers one period; when a later period is paid for
 * successfully, that refund has nothing left to say and the flag has to lift —
 * otherwise the visitor keeps being billed with no access, forever and silently.
 *
 * The period end is what separates "a new period was paid" from "the refunded
 * invoice was simply retried".
 */
export const ACCESS_REVOKED_REASON_METADATA_KEY = 'access_revoked_reason'
export const ACCESS_REVOKED_PERIOD_END_METADATA_KEY = 'access_revoked_period_end'

export const ACCESS_REVOKED_REASON_REFUND = 'refund'
export const ACCESS_REVOKED_REASON_DISPUTE = 'dispute'

export type AccessRevokedReason =
  | typeof ACCESS_REVOKED_REASON_REFUND
  | typeof ACCESS_REVOKED_REASON_DISPUTE

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Stripe statuses where the *current* period has not been paid for. In these
 * states the subscription's period has already rolled forward optimistically,
 * so its end date describes time the visitor has not bought.
 *
 * `canceled` is deliberately absent: it means both endings at once and has to
 * be decided per subscription — see `canceledPeriodWasPaid`.
 */
const UNPAID_CURRENT_PERIOD = new Set<Stripe.Subscription.Status>([
  'past_due',
  'unpaid',
  'incomplete',
  'incomplete_expired',
])

export type DerivedSubscriptionState = {
  subscriptionStatus: 'none' | 'active' | 'cancelled' | 'past_due'
  cancelAtPeriodEnd: boolean
  paidThroughAt: string | null
  dunningGraceUntil: string | null
}

export type DeriveContext = {
  /** Existing grace on the profile; a live grace is kept rather than restarted. */
  previousDunningGraceUntil?: string | null
  now?: Date
  graceDays?: number
  /**
   * `next_payment_attempt` from the subscription's latest invoice, when known.
   * Stripe states outright when it will try the card again; the grace uses that
   * rather than assuming the fixed window outlasts it.
   */
  nextPaymentAttempt?: number | null
}

/**
 * Slack added past Stripe's scheduled retry so the grace cannot expire in the
 * minutes around the attempt, and so a recovered payment has time to land.
 */
const RETRY_COVER_BUFFER_MS = 6 * 60 * 60 * 1000

/**
 * Stripe moved `current_period_end` off the subscription root and onto the
 * subscription item. Read only the item: handlers refetch through the SDK, so
 * there is exactly one shape to support (ADR-0008).
 */
export function getSubscriptionPeriodSeconds(
  subscription: Stripe.Subscription
): { start: number | null; end: number | null } {
  const item = subscription.items?.data?.[0] as
    | { current_period_start?: number | null; current_period_end?: number | null }
    | undefined

  if (!item) {
    logger.warn('Subscription has no items; cannot resolve billing period', {
      subscriptionId: subscription.id,
    })
    return { start: null, end: null }
  }

  return {
    start: item.current_period_start ?? null,
    end: item.current_period_end ?? null,
  }
}

function getPeriod(subscription: Stripe.Subscription): { start: Date | null; end: Date | null } {
  const { start, end } = getSubscriptionPeriodSeconds(subscription)

  return {
    start: convertStripeTimestamp(start),
    end: convertStripeTimestamp(end),
  }
}

/**
 * Whether the invoice Stripe last raised on this subscription was collected.
 *
 * `null` means the answer is unavailable rather than negative: `latest_invoice`
 * is an id unless the caller expanded it, and a missing expansion must not be
 * read as a failed payment.
 */
function latestInvoiceWasPaid(subscription: Stripe.Subscription): boolean | null {
  const invoice = subscription.latest_invoice

  if (!invoice || typeof invoice === 'string') return null

  const { status, paid } = invoice as Stripe.Invoice & { paid?: boolean }

  if (status) return status === 'paid'
  if (typeof paid === 'boolean') return paid

  return null
}

/**
 * Whether a cancelled subscription's current period was ever bought.
 *
 * `canceled` covers two opposite endings. A visitor who cancels at period end
 * has paid for the period they are sitting in, and Stripe ends the subscription
 * exactly when that period expires. Dunning ends the other way round: the
 * renewal advanced the period first, the charge never cleared, Stripe retried
 * for weeks and then cancelled — mid-period, on time nobody paid for. Reading
 * `current_period_end` there hands out the remainder free, about nine days on a
 * monthly plan and most of a year on an annual one.
 *
 * The invoice is the direct evidence, and the resync path expands it. Where it
 * is absent, `ended_at` still separates the two shapes: a cancel-at-period-end
 * lands on the period boundary, a dunning cancel lands before it. With neither
 * signal the period is treated as paid, so silence never revokes access.
 */
function canceledPeriodWasPaid(
  subscription: Stripe.Subscription,
  periodEnd: Date | null
): boolean {
  const invoicePaid = latestInvoiceWasPaid(subscription)
  if (invoicePaid !== null) return invoicePaid

  const endedAt = convertStripeTimestamp(subscription.ended_at ?? null)
  if (!endedAt || !periodEnd) return true

  return endedAt.getTime() >= periodEnd.getTime()
}

/**
 * The end of the last period the visitor actually paid for.
 *
 * Stripe advances the period at the renewal moment, before the charge clears,
 * so `current_period_end` overstates paid time whenever the current period is
 * unpaid. In that case the *start* of the current period is precisely the end
 * of the last paid one, which is what this returns.
 */
function resolvePaidThrough(subscription: Stripe.Subscription): Date | null {
  const { start, end } = getPeriod(subscription)

  if (UNPAID_CURRENT_PERIOD.has(subscription.status)) return start

  if (subscription.status === 'canceled') {
    return canceledPeriodWasPaid(subscription, end) ? end : start
  }

  return end
}

/**
 * A grace already running is never extended by a later event, otherwise every
 * retry failure would push the deadline out and the grace would never expire.
 *
 * The window is the fixed grace, or Stripe's next scheduled retry plus a
 * buffer, whichever is later. The fixed window alone is not reliably enough:
 * in the captured run, five days measured from the start of the unpaid period
 * expired seven hours before Stripe's first retry, which would revoke access
 * from a visitor about to be recovered.
 *
 * Grace is for recovering a payment that once worked. `incomplete` is mapped
 * to internal `past_due` for display, but that subscription never collected,
 * so it must not open a membership window.
 */
function resolveDunningGrace(
  stripeStatus: Stripe.Subscription.Status,
  context: DeriveContext
): string | null {
  if (stripeStatus !== 'past_due' && stripeStatus !== 'unpaid') return null

  const existing = context.previousDunningGraceUntil
  if (existing) return existing

  const now = context.now ?? new Date()
  const graceDays = context.graceDays ?? DUNNING_GRACE_DAYS
  const fixedWindow = now.getTime() + graceDays * DAY_MS

  const retryAt = convertStripeTimestamp(context.nextPaymentAttempt ?? null)
  const coversRetry = retryAt ? retryAt.getTime() + RETRY_COVER_BUFFER_MS : 0

  return new Date(Math.max(fixedWindow, coversRetry)).toISOString()
}

/**
 * Turn a freshly fetched Stripe subscription into the profile fields it implies.
 * Pure: every input is an argument, so it is testable against captured payloads.
 */
export function deriveSubscriptionState(
  subscription: Stripe.Subscription,
  context: DeriveContext = {}
): DerivedSubscriptionState {
  const subscriptionStatus = mapStripeStatusToInternal(subscription.status)

  if (subscription.metadata?.[ACCESS_REVOKED_METADATA_KEY] === ACCESS_REVOKED_METADATA_VALUE) {
    return {
      subscriptionStatus,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      paidThroughAt: null,
      dunningGraceUntil: null,
    }
  }

  const paidThrough = resolvePaidThrough(subscription)

  return {
    subscriptionStatus,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    paidThroughAt: paidThrough ? paidThrough.toISOString() : null,
    dunningGraceUntil: resolveDunningGrace(subscription.status, context),
  }
}
