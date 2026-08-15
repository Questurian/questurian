import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'

import fixture from '../__fixtures__/membership-lifecycle.events.json'
import { DUNNING_GRACE_DAYS, deriveSubscriptionState } from './subscription-state'

/**
 * These run against payloads Stripe genuinely emitted during a test-clock run,
 * not hand-built objects. That distinction is the whole point: the previous
 * suite invented a `current_period_end` at the subscription root, which the
 * SDK's API version does not produce, and stayed green over a real bug.
 */
type CapturedEvent = {
  type: string
  data: { object: Record<string, unknown> }
}

const events = fixture.events as CapturedEvent[]

function subscriptionEvents(): Stripe.Subscription[] {
  return events
    .filter((event) => event.data.object.object === 'subscription')
    .map((event) => event.data.object as unknown as Stripe.Subscription)
}

function firstWhere(predicate: (subscription: Stripe.Subscription) => boolean): Stripe.Subscription {
  const found = subscriptionEvents().find(predicate)
  if (!found) throw new Error('Fixture is missing a subscription matching that condition')
  return found
}

function periodOf(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0] as unknown as {
    current_period_start: number
    current_period_end: number
  }
  return {
    start: new Date(item.current_period_start * 1000).toISOString(),
    end: new Date(item.current_period_end * 1000).toISOString(),
  }
}

describe('deriveSubscriptionState', () => {
  it('captures the full lifecycle, so the fixtures cover what we claim they cover', () => {
    const types = events.map((event) => event.type)

    expect(types).toContain('customer.subscription.created')
    expect(types).toContain('invoice.payment_failed')
    expect(types).toContain('customer.subscription.deleted')
    expect(subscriptionEvents().some((s) => s.status === 'past_due')).toBe(true)
  })

  it('uses the period end while the current period is paid', () => {
    const active = firstWhere((s) => s.status === 'active' && !s.cancel_at_period_end)

    expect(deriveSubscriptionState(active)).toMatchObject({
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: false,
      paidThroughAt: periodOf(active).end,
    })
  })

  it('falls back to the period START while the current period is unpaid', () => {
    const pastDue = firstWhere((s) => s.status === 'past_due')
    const period = periodOf(pastDue)

    // The regression this guards: Stripe advanced the period at renewal before
    // the charge cleared, so the end date describes an unpaid month.
    expect(period.start).not.toEqual(period.end)
    expect(deriveSubscriptionState(pastDue).paidThroughAt).toEqual(period.start)
  })

  it('never reports paid-through beyond the last paid period during dunning', () => {
    const pastDue = firstWhere((s) => s.status === 'past_due')
    const derived = deriveSubscriptionState(pastDue)

    expect(new Date(derived.paidThroughAt!).getTime()).toBeLessThan(
      new Date(periodOf(pastDue).end).getTime()
    )
  })

  it('opens a bounded dunning grace when the subscription goes past due', () => {
    const pastDue = firstWhere((s) => s.status === 'past_due')
    const now = new Date('2026-09-15T13:10:00.000Z')

    const derived = deriveSubscriptionState(pastDue, { now })

    const expected = new Date(now.getTime() + DUNNING_GRACE_DAYS * 24 * 60 * 60 * 1000)
    expect(derived.dunningGraceUntil).toEqual(expected.toISOString())
  })

  it('covers the first Stripe retry even when observed at the earliest moment', () => {
    const failure = events.find((event) => event.type === 'invoice.payment_failed')!
    const nextAttempt = (failure.data.object as { next_payment_attempt: number }).next_payment_attempt
    const pastDue = firstWhere((s) => s.status === 'past_due')

    // Worst case: grace opened at the very start of the unpaid period. The
    // fixed five-day window alone expires seven hours before this retry, so
    // this passes only because the retry time is taken into account.
    const observedAt = new Date(periodOf(pastDue).start)
    const graceEnds = new Date(
      deriveSubscriptionState(pastDue, { now: observedAt, nextPaymentAttempt: nextAttempt })
        .dunningGraceUntil!
    )

    expect(graceEnds.getTime()).toBeGreaterThan(nextAttempt * 1000)
  })

  it('still honours the fixed window when the retry is scheduled sooner', () => {
    const pastDue = firstWhere((s) => s.status === 'past_due')
    const now = new Date('2026-09-15T13:10:00.000Z')
    const soon = Math.floor(now.getTime() / 1000) + 60 * 60

    const derived = deriveSubscriptionState(pastDue, { now, nextPaymentAttempt: soon })

    expect(derived.dunningGraceUntil).toEqual(
      new Date(now.getTime() + DUNNING_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    )
  })

  it('keeps a grace already running rather than restarting it on every retry', () => {
    const pastDue = firstWhere((s) => s.status === 'past_due')
    const existing = '2026-09-20T00:00:00.000Z'

    const derived = deriveSubscriptionState(pastDue, {
      previousDunningGraceUntil: existing,
      now: new Date('2026-09-19T00:00:00.000Z'),
    })

    expect(derived.dunningGraceUntil).toEqual(existing)
  })

  it('clears the grace once the subscription recovers', () => {
    const recovered = firstWhere((s) => s.status === 'active')

    const derived = deriveSubscriptionState(recovered, {
      previousDunningGraceUntil: '2026-09-20T00:00:00.000Z',
    })

    expect(derived.dunningGraceUntil).toBeNull()
  })

  it('marks a pending cancellation without ending paid access early', () => {
    const cancelling = firstWhere((s) => s.status === 'active' && s.cancel_at_period_end)

    expect(deriveSubscriptionState(cancelling)).toMatchObject({
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: true,
      paidThroughAt: periodOf(cancelling).end,
    })
  })

  it('honours the paid period on a deleted subscription', () => {
    const deleted = firstWhere((s) => s.status === 'canceled')

    // This fixture is the *voluntary* ending: cancel at period end, so Stripe
    // stopped the subscription exactly when the paid period ran out. Asserting
    // that keeps the test honest — it is not evidence about a dunning cancel,
    // which ends mid-period and is covered below.
    expect(deleted.ended_at! * 1000).toEqual(new Date(periodOf(deleted).end).getTime())

    // The old handler read current_period_end off the subscription root, which
    // the SDK's API version does not populate, so this silently became null.
    expect(deriveSubscriptionState(deleted)).toMatchObject({
      subscriptionStatus: 'cancelled',
      paidThroughAt: periodOf(deleted).end,
    })
  })

  describe('a subscription Stripe cancelled after dunning', () => {
    /**
     * The renewal advanced the period, the charge never cleared, Stripe retried
     * for three weeks and then cancelled. `current_period_end` is still in the
     * future here, and it describes time nobody paid for.
     */
    function dunningCancelled(overrides: Partial<Stripe.Subscription> = {}) {
      const pastDue = firstWhere((s) => s.status === 'past_due')
      const period = periodOf(pastDue)
      const endedAt = new Date(new Date(period.start).getTime() + 21 * 24 * 60 * 60 * 1000)

      expect(endedAt.getTime()).toBeLessThan(new Date(period.end).getTime())

      return {
        subscription: {
          ...pastDue,
          status: 'canceled',
          ended_at: Math.floor(endedAt.getTime() / 1000),
          ...overrides,
        } as Stripe.Subscription,
        period,
      }
    }

    it('stops paid access at the last collected period when the invoice never paid', () => {
      const { subscription, period } = dunningCancelled({
        latest_invoice: { id: 'in_dunning', status: 'open' } as unknown as Stripe.Invoice,
      })

      expect(deriveSubscriptionState(subscription)).toMatchObject({
        subscriptionStatus: 'cancelled',
        paidThroughAt: period.start,
      })
    })

    it('falls back to ended_at when latest_invoice was not expanded', () => {
      const { subscription, period } = dunningCancelled()

      expect(typeof subscription.latest_invoice).toBe('string')
      expect(deriveSubscriptionState(subscription).paidThroughAt).toEqual(period.start)
    })

    it('keeps the period end when the final invoice was actually paid', () => {
      // Same mid-period ending, opposite money: an immediate cancellation on a
      // period the visitor already bought must not claw back the rest of it.
      const { subscription, period } = dunningCancelled({
        latest_invoice: { id: 'in_paid', status: 'paid' } as unknown as Stripe.Invoice,
      })

      expect(deriveSubscriptionState(subscription).paidThroughAt).toEqual(period.end)
    })
  })

  it('does not open dunning grace for an incomplete subscription that never paid', () => {
    const incomplete = {
      ...firstWhere((s) => s.status === 'active'),
      status: 'incomplete',
    } as Stripe.Subscription
    const now = new Date('2026-09-15T13:10:00.000Z')

    const derived = deriveSubscriptionState(incomplete, { now })

    expect(derived.subscriptionStatus).toBe('past_due')
    expect(derived.dunningGraceUntil).toBeNull()
    expect(derived.paidThroughAt).toEqual(periodOf(incomplete).start)
  })

  it('still opens dunning grace for unpaid, which is a failed collection after a real period', () => {
    const unpaid = {
      ...firstWhere((s) => s.status === 'past_due'),
      status: 'unpaid',
    } as Stripe.Subscription
    const now = new Date('2026-09-15T13:10:00.000Z')

    const derived = deriveSubscriptionState(unpaid, { now })

    expect(derived.dunningGraceUntil).toEqual(
      new Date(now.getTime() + DUNNING_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    )
  })

  it('clears paid-through and grace when Stripe metadata says access was revoked', () => {
    const active = firstWhere((s) => s.status === 'active' && !s.cancel_at_period_end)
    const revoked = {
      ...active,
      metadata: { access_revoked: 'true' },
    } as Stripe.Subscription

    expect(deriveSubscriptionState(revoked, {
      previousDunningGraceUntil: '2026-09-20T00:00:00.000Z',
    })).toMatchObject({
      paidThroughAt: null,
      dunningGraceUntil: null,
    })
  })
})
