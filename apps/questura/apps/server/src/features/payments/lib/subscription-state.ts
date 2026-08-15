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

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Stripe statuses where the *current* period has not been paid for. In these
 * states the subscription's period has already rolled forward optimistically,
 * so its end date describes time the visitor has not bought.
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
function getPeriod(subscription: Stripe.Subscription): { start: Date | null; end: Date | null } {
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
    start: convertStripeTimestamp(item.current_period_start ?? null),
    end: convertStripeTimestamp(item.current_period_end ?? null),
  }
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

  return UNPAID_CURRENT_PERIOD.has(subscription.status) ? start : end
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
  const paidThrough = resolvePaidThrough(subscription)

  return {
    subscriptionStatus,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    paidThroughAt: paidThrough ? paidThrough.toISOString() : null,
    dunningGraceUntil: resolveDunningGrace(subscription.status, context),
  }
}
