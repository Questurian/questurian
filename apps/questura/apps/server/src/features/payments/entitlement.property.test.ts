import fc from 'fast-check'
import type Stripe from 'stripe'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { deriveVisitorMembership } from '@/features/visitor-auth/lib/membership-entitlement'

import {
  ACCESS_REVOKED_METADATA_KEY,
  ACCESS_REVOKED_METADATA_VALUE,
  ACCESS_REVOKED_REASON_METADATA_KEY,
  DUNNING_GRACE_DAYS,
  deriveSubscriptionState,
} from './lib/subscription-state'

/**
 * Launch harness A4: entitlement, checked over random states instead of
 * the ones someone thought to write down.
 *
 * `subscription-state.test.ts` covers captured payloads. Here fast-check
 * generates the combinations: Stripe status × period dates × cancel flag ×
 * latest invoice × `ended_at` × revocation × existing grace × next retry ×
 * clock position. It then holds the invariants that decide whether a stranger
 * reads paid content for free, or a payer is locked out.
 *
 * On failure fast-check prints a seed and a shrunk counterexample. Rerun
 * with `fc.assert(..., { seed, path })` to reproduce.
 */

const DAY = 24 * 60 * 60
const NOW = Date.UTC(2026, 8, 23, 12, 0, 0) / 1000
const RUNS = { numRuns: 2_000 }

const STATUSES: Stripe.Subscription.Status[] = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
]

const invoice = fc.oneof(
  fc.constant(null),
  fc.constant('in_unexpanded'),
  fc.record({
    status: fc.constantFrom('paid', 'open', 'void', 'uncollectible', 'draft', undefined),
    paid: fc.option(fc.boolean(), { nil: undefined }),
  }),
)

const revocation = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom('refund', 'dispute', 'legacy').map((reason) => ({
    [ACCESS_REVOKED_METADATA_KEY]: ACCESS_REVOKED_METADATA_VALUE,
    ...(reason === 'legacy' ? {} : { [ACCESS_REVOKED_REASON_METADATA_KEY]: reason }),
  })),
)

/** A subscription whose current period started at or before now, as Stripe's do. */
const scenario = fc
  .record({
    status: fc.constantFrom(...STATUSES),
    startAgo: fc.integer({ min: 0, max: 400 * DAY }),
    length: fc.integer({ min: 1, max: 370 * DAY }),
    cancelAtPeriodEnd: fc.boolean(),
    latestInvoice: invoice,
    endedOffset: fc.option(fc.integer({ min: -40 * DAY, max: 40 * DAY }), { nil: null }),
    metadata: revocation,
    previousGraceOffset: fc.option(fc.integer({ min: -30 * DAY, max: 30 * DAY }), { nil: null }),
    nextAttemptOffset: fc.option(fc.integer({ min: -5 * DAY, max: 30 * DAY }), { nil: null }),
    graceDays: fc.option(fc.integer({ min: 0, max: 30 }), { nil: undefined }),
  })
  .map((s) => {
    const start = NOW - s.startAgo
    const end = start + s.length
    const subscription = {
      id: 'sub_property',
      status: s.status,
      cancel_at_period_end: s.cancelAtPeriodEnd,
      items: { data: [{ current_period_start: start, current_period_end: end }] },
      latest_invoice: s.latestInvoice,
      ended_at: s.endedOffset === null ? null : end + s.endedOffset,
      metadata: s.metadata ?? {},
    } as unknown as Stripe.Subscription

    return {
      ...s,
      start,
      end,
      subscription,
      context: {
        now: new Date(NOW * 1000),
        graceDays: s.graceDays,
        previousDunningGraceUntil:
          s.previousGraceOffset === null
            ? null
            : new Date((NOW + s.previousGraceOffset) * 1000).toISOString(),
        nextPaymentAttempt: s.nextAttemptOffset === null ? null : NOW + s.nextAttemptOffset,
      },
    }
  })

/** Whether the derived profile is entitled when the clock reads `atSeconds`. */
function entitledAt(state: ReturnType<typeof deriveSubscriptionState>, atSeconds: number): boolean {
  vi.setSystemTime(new Date(atSeconds * 1000))
  return deriveVisitorMembership(state).active
}

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() / 1000 : -Infinity)

afterEach(() => {
  vi.useRealTimers()
})

describe('entitlement invariants', () => {
  it('a refund or dispute revocation always wins, at every clock position', () => {
    vi.useFakeTimers()
    fc.assert(
      fc.property(scenario, fc.integer({ min: -400 * DAY, max: 800 * DAY }), (s, offset) => {
        fc.pre(s.metadata !== undefined)
        const state = deriveSubscriptionState(s.subscription, s.context)

        expect(state.paidThroughAt).toBeNull()
        expect(state.dunningGraceUntil).toBeNull()
        expect(entitledAt(state, NOW + offset)).toBe(false)
      }),
      RUNS,
    )
  })

  it('never entitles incomplete or incomplete_expired, which never collected', () => {
    vi.useFakeTimers()
    fc.assert(
      fc.property(scenario, fc.integer({ min: 0, max: 800 * DAY }), (s, later) => {
        fc.pre(s.status === 'incomplete' || s.status === 'incomplete_expired')
        const state = deriveSubscriptionState(s.subscription, s.context)

        expect(state.dunningGraceUntil).toBeNull()
        expect(entitledAt(state, NOW + later)).toBe(false)
      }),
      RUNS,
    )
  })

  it('never entitles a canceled subscription whose last invoice was not paid', () => {
    vi.useFakeTimers()
    fc.assert(
      fc.property(scenario, fc.integer({ min: 0, max: 800 * DAY }), (s, later) => {
        const inv = s.latestInvoice
        fc.pre(s.status === 'canceled' && inv !== null && typeof inv === 'object')
        const unpaid = inv.status ? inv.status !== 'paid' : inv.paid === false
        fc.pre(unpaid)

        expect(entitledAt(deriveSubscriptionState(s.subscription, s.context), NOW + later)).toBe(false)
      }),
      RUNS,
    )
  })

  it('never entitles past the later of paid-through and grace, nor exactly on it', () => {
    vi.useFakeTimers()
    fc.assert(
      fc.property(scenario, fc.integer({ min: 0, max: 400 * DAY }), (s, after) => {
        const state = deriveSubscriptionState(s.subscription, s.context)
        const boundary = Math.max(ms(state.paidThroughAt), ms(state.dunningGraceUntil))
        fc.pre(Number.isFinite(boundary))

        expect(entitledAt(state, boundary)).toBe(false)
        expect(entitledAt(state, boundary + after)).toBe(false)
      }),
      RUNS,
    )
  })

  it('once access ends it stays ended as the clock moves forward', () => {
    vi.useFakeTimers()
    fc.assert(
      fc.property(
        scenario,
        fc.integer({ min: -400 * DAY, max: 800 * DAY }),
        fc.integer({ min: 1, max: 800 * DAY }),
        (s, t, forward) => {
          const state = deriveSubscriptionState(s.subscription, s.context)
          if (!entitledAt(state, NOW + t)) expect(entitledAt(state, NOW + t + forward)).toBe(false)
        },
      ),
      RUNS,
    )
  })

  it('never grants paid time beyond the period Stripe reports', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const state = deriveSubscriptionState(s.subscription, s.context)
        if (state.paidThroughAt) expect(ms(state.paidThroughAt)).toBeLessThanOrEqual(s.end)
      }),
      RUNS,
    )
  })

  it('grants no paid time in the current period while it is unpaid', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        fc.pre(['past_due', 'unpaid', 'incomplete', 'incomplete_expired'].includes(s.status))
        fc.pre(s.metadata === undefined)
        const state = deriveSubscriptionState(s.subscription, s.context)

        expect(ms(state.paidThroughAt)).toBe(s.start)
      }),
      RUNS,
    )
  })

  it('a running grace is never extended by a later event', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        fc.pre(s.status === 'past_due' || s.status === 'unpaid')
        fc.pre(s.metadata === undefined && s.context.previousDunningGraceUntil !== null)

        const state = deriveSubscriptionState(s.subscription, s.context)
        expect(state.dunningGraceUntil).toBe(s.context.previousDunningGraceUntil)
      }),
      RUNS,
    )
  })

  it('a new grace is the fixed window or the next retry plus six hours, whichever is later', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        fc.pre(s.status === 'past_due' || s.status === 'unpaid')
        fc.pre(s.metadata === undefined && s.context.previousDunningGraceUntil === null)

        const state = deriveSubscriptionState(s.subscription, s.context)
        const fixed = NOW + (s.graceDays ?? DUNNING_GRACE_DAYS) * DAY
        const retry = s.context.nextPaymentAttempt === null ? -Infinity : s.context.nextPaymentAttempt + 6 * 3600
        const retryCover = s.context.nextPaymentAttempt && s.context.nextPaymentAttempt > 0 ? retry : -Infinity

        expect(ms(state.dunningGraceUntil)).toBe(Math.max(fixed, retryCover))
      }),
      RUNS,
    )
  })

  it('opens no grace outside past_due and unpaid', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        fc.pre(s.status !== 'past_due' && s.status !== 'unpaid')
        expect(deriveSubscriptionState(s.subscription, s.context).dunningGraceUntil).toBeNull()
      }),
      RUNS,
    )
  })
})

describe('deriveVisitorMembership on hostile profile fields', () => {
  // Profile columns are written by our own code, but a bad migration or a
  // manual edit can put anything there. Nothing that is not a real future
  // date may read as entitled.
  it('never entitles a value that is not a parseable future date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW * 1000))
    const notAFutureDate = fc.oneof(
      fc.string(),
      fc.constantFrom('', 'null', 'undefined', 'Infinity', 'NaN', '0', 'true', 'active', '9999'),
      fc.integer({ min: -400, max: 0 }).map((d) => new Date((NOW + d * DAY) * 1000).toISOString()),
    )

    fc.assert(
      fc.property(
        fc.option(notAFutureDate, { nil: null }),
        fc.option(notAFutureDate, { nil: null }),
        fc.constantFrom('active', 'past_due', 'cancelled', 'none', null),
        (paidThroughAt, dunningGraceUntil, subscriptionStatus) => {
          const probe = (value: string | null) =>
            value !== null && !Number.isNaN(new Date(value).getTime()) && new Date(value).getTime() > NOW * 1000
          fc.pre(!probe(paidThroughAt) && !probe(dunningGraceUntil))

          expect(
            deriveVisitorMembership({ paidThroughAt, dunningGraceUntil, subscriptionStatus }).active,
          ).toBe(false)
        },
      ),
      { numRuns: 5_000 },
    )
  })

  it('ignores subscriptionStatus entirely: status "active" alone is not entitlement', () => {
    expect(deriveVisitorMembership({ subscriptionStatus: 'active' }).active).toBe(false)
  })
})
