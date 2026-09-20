import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'

import fixture from '../__fixtures__/membership-incomplete.events.json'
import { DUNNING_GRACE_DAYS, deriveSubscriptionState } from './subscription-state'

/**
 * The waiting state, against payloads Stripe actually emitted.
 *
 * `incomplete` is what a subscription is between "the visitor pressed pay" and
 * "the money arrived" — in production, the window while a 3DS challenge is
 * open. Three separate pieces of logic have a branch for it (`UNPAID_CURRENT_PERIOD`,
 * `mapStripeStatusToInternal`, and `resolveDunningGrace` refusing it a grace
 * window), and until now every one of them was tested only against hand-built
 * objects. Hand-built objects are exactly what hid the `current_period_end` bug
 * that motivated the fixture capture in the first place.
 *
 * `__fixtures__/membership-incomplete.events.json` is a real run: a subscription
 * created with `payment_behavior: 'default_incomplete'`, then its invoice paid.
 * It records the shape of the wait and the shape of the wait ending.
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

function periodOf(subscription: Stripe.Subscription): { start: number; end: number } {
  const item = subscription.items.data[0] as unknown as {
    current_period_start: number
    current_period_end: number
  }
  return { start: item.current_period_start, end: item.current_period_end }
}

function firstWithStatus(status: string): Stripe.Subscription {
  const found = subscriptionEvents().find((subscription) => subscription.status === status)
  if (!found) throw new Error(`Fixture has no subscription in ${status}`)
  return found
}

/**
 * The fixture is a recording, and a recording ages. Its subscription covers
 * 19 Aug -> 19 Sep 2026, so on 19 Sep the assertions below that compared it
 * against the real clock started failing on every run, permanently.
 *
 * Those comparisons are not testing the clock. They state the precondition
 * that gives the rest of this file its meaning: a real, future, plausible
 * period end sitting on a subscription that has collected nothing. So the
 * test takes its "now" from inside the recording rather than from the wall.
 *
 * Derived, not hardcoded: re-capturing the fixture carries this with it and
 * needs no edit here. Re-capturing is not the fix for a failure at this line,
 * though — it buys one month and then fails again.
 *
 * The code under test barely reads a clock at all. `resolvePaidThrough`
 * derives entirely from the subscription's own fields, and the one place that
 * does read one, `resolveDunningGrace`, takes it from `DeriveContext.now`.
 */
const AS_OF = (() => {
  const period = periodOf(firstWithStatus('incomplete'))
  return new Date(Math.floor((period.start + period.end) / 2) * 1000)
})()

describe('the incomplete waiting state, from captured payloads', () => {
  // Guards the fixture itself. A capture that silently returned only
  // `subscription.created` would leave every assertion below passing against a
  // subscription that never leaves the waiting state — which is precisely what
  // the first run of this capture produced before it learned to wait for
  // Stripe's event list to catch up.
  it('captured both halves: the wait, and the wait ending', () => {
    const types = events.map((event) => event.type)

    expect(types).toContain('customer.subscription.created')
    expect(types).toContain('invoice.payment_succeeded')
    expect(types).toContain('customer.subscription.updated')

    const statuses = subscriptionEvents().map((subscription) => subscription.status)
    expect(statuses).toContain('incomplete')
    expect(statuses).toContain('active')
  })

  // The reason `incomplete` cannot be treated like any other status: Stripe has
  // already rolled the period forward on a subscription that has collected
  // nothing, so its period end describes time nobody has bought.
  //
  // Note the mechanism is not a null. `resolvePaidThrough` pins an unpaid
  // current period to its *start* — the end of the last period actually paid
  // for, which on a first subscription is the moment it was created. That is
  // already in the past, so entitlement (`paidThroughAt > now`) is false, and
  // the value still says something true rather than discarding the period.
  it('pins entitlement to the period start while the first payment has not landed', () => {
    const waiting = firstWithStatus('incomplete')
    const item = periodOf(waiting)

    const state = deriveSubscriptionState(waiting)

    expect(state.paidThroughAt).toBe(new Date(item.start * 1000).toISOString())
  })

  it('never hands out the period end of a subscription that has not collected', () => {
    const waiting = firstWithStatus('incomplete')
    const item = periodOf(waiting)

    // The trap: a real, future, plausible-looking timestamp sitting on an unpaid
    // subscription. Reading it would grant a month of access for nothing.
    expect(item.end).toBeGreaterThan(Math.floor(AS_OF.getTime() / 1000))

    const state = deriveSubscriptionState(waiting, { now: AS_OF })

    expect(state.paidThroughAt).not.toBe(new Date(item.end * 1000).toISOString())
    // And what it does hand out buys no time at all.
    expect(new Date(state.paidThroughAt!).getTime()).toBeLessThanOrEqual(AS_OF.getTime())
  })

  // Grace exists to recover a payment that once worked. A subscription that has
  // never collected has nothing to recover, so opening a window here would hand
  // out free access to anyone who abandons a 3DS challenge.
  it('opens no dunning grace for a subscription that never collected', () => {
    const waiting = firstWithStatus('incomplete')

    const state = deriveSubscriptionState(waiting, {
      graceDays: DUNNING_GRACE_DAYS,
      now: AS_OF,
    })

    expect(state.dunningGraceUntil).toBeNull()
  })

  it('surfaces the wait as past_due, the status the account page can explain', () => {
    const waiting = firstWithStatus('incomplete')

    expect(deriveSubscriptionState(waiting).subscriptionStatus).toBe('past_due')
  })

  // The half that matters to a visitor who completed their challenge: once the
  // invoice is paid, entitlement has to appear.
  it('grants entitlement once the payment lands', () => {
    const settled = firstWithStatus('active')

    const state = deriveSubscriptionState(settled)

    expect(state.subscriptionStatus).toBe('active')
    expect(state.paidThroughAt).not.toBeNull()
    expect(state.dunningGraceUntil).toBeNull()
  })

  // Same subscription, same period, opposite entitlement — so the difference is
  // the status and nothing else. This is the assertion that would fail if
  // `UNPAID_CURRENT_PERIOD` ever stopped listing `incomplete`.
  it('turns the same period from no access into access, on status alone', () => {
    const waiting = firstWithStatus('incomplete')
    const settled = firstWithStatus('active')

    expect(periodOf(waiting).end).toBe(periodOf(settled).end)

    const waitingThrough = new Date(
      deriveSubscriptionState(waiting, { now: AS_OF }).paidThroughAt!
    ).getTime()
    const settledThrough = new Date(
      deriveSubscriptionState(settled, { now: AS_OF }).paidThroughAt!
    ).getTime()

    expect(waitingThrough).toBeLessThanOrEqual(AS_OF.getTime())
    expect(settledThrough).toBeGreaterThan(AS_OF.getTime())
  })
})
