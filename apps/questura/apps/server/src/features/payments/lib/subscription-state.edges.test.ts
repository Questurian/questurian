import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'

import {
  ACCESS_REVOKED_METADATA_KEY,
  ACCESS_REVOKED_PERIOD_END_METADATA_KEY,
  ACCESS_REVOKED_REASON_METADATA_KEY,
  deriveSubscriptionState,
  getSubscriptionPeriodSeconds,
  readAccessRevocation,
} from './subscription-state'

/**
 * Branches `pnpm mutation` showed could be broken with every other test
 * still passing. Each case pins one decision about who is entitled.
 */

const START = 1_790_000_000
const END = START + 30 * 24 * 60 * 60
const iso = (seconds: number) => new Date(seconds * 1000).toISOString()

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_edges',
    status: 'active',
    cancel_at_period_end: false,
    items: { data: [{ current_period_start: START, current_period_end: END }] },
    latest_invoice: null,
    ended_at: null,
    metadata: {},
    ...overrides,
  } as unknown as Stripe.Subscription
}

describe('readAccessRevocation', () => {
  const revoked = (extra: Record<string, string>) =>
    subscription({ metadata: { [ACCESS_REVOKED_METADATA_KEY]: 'true', ...extra } })

  it('is null without the flag', () => {
    expect(readAccessRevocation(subscription())).toBeNull()
    expect(readAccessRevocation(subscription({ metadata: { [ACCESS_REVOKED_METADATA_KEY]: 'yes' } }))).toBeNull()
  })

  // Only a dispute's own resolution may restore access; a refund lifts on
  // the next paid period. Mixing them up either locks out a payer forever or
  // hands access back to a chargeback.
  it('tells a dispute from a refund', () => {
    expect(readAccessRevocation(revoked({ [ACCESS_REVOKED_REASON_METADATA_KEY]: 'dispute' }))?.reason).toBe('dispute')
    expect(readAccessRevocation(revoked({ [ACCESS_REVOKED_REASON_METADATA_KEY]: 'refund' }))?.reason).toBe('refund')
  })

  it('reads a flag with no reason, written before reasons existed, as a refund', () => {
    expect(readAccessRevocation(revoked({}))?.reason).toBe('refund')
    expect(readAccessRevocation(revoked({ [ACCESS_REVOKED_REASON_METADATA_KEY]: 'other' }))?.reason).toBe('refund')
  })

  it.each([
    ['1790000000', 1_790_000_000],
    ['0', null],
    ['-5', null],
    ['abc', null],
    ['', null],
    ['Infinity', null],
  ])('reads period end %j as %s', (raw, expected) => {
    expect(readAccessRevocation(revoked({ [ACCESS_REVOKED_PERIOD_END_METADATA_KEY]: raw }))?.periodEnd).toBe(expected)
  })

  it('reads a missing period end as null', () => {
    expect(readAccessRevocation(revoked({}))?.periodEnd).toBeNull()
  })
})

describe('getSubscriptionPeriodSeconds', () => {
  it('answers null dates, not an empty object, for a subscription with no items', () => {
    expect(getSubscriptionPeriodSeconds(subscription({ items: { data: [] } }))).toEqual({ start: null, end: null })
  })
})

describe('paid-through for a canceled subscription', () => {
  const canceled = (overrides: Record<string, unknown>) => deriveSubscriptionState(subscription({ status: 'canceled', ...overrides }))

  it('uses the invoice `paid` flag when the invoice has no status', () => {
    expect(canceled({ latest_invoice: { paid: true } }).paidThroughAt).toBe(iso(END))
    expect(canceled({ latest_invoice: { paid: false } }).paidThroughAt).toBe(iso(START))
  })

  it('falls back to ended_at when an expanded invoice says neither', () => {
    expect(canceled({ latest_invoice: {}, ended_at: END }).paidThroughAt).toBe(iso(END))
    expect(canceled({ latest_invoice: {}, ended_at: END - 9 * 24 * 60 * 60 }).paidThroughAt).toBe(iso(START))
  })

  it('treats silence as paid, so missing evidence never revokes access', () => {
    expect(canceled({}).paidThroughAt).toBe(iso(END))
    expect(canceled({ latest_invoice: 'in_unexpanded' }).paidThroughAt).toBe(iso(END))
  })
})

describe('paid-through outside cancellation', () => {
  // Only `canceled` consults the invoice. An active subscription with an open
  // invoice is mid-renewal; its period is Stripe's to report.
  it('an active subscription keeps its period end whatever its latest invoice says', () => {
    const state = deriveSubscriptionState(subscription({ status: 'active', latest_invoice: { status: 'open' } }))

    expect(state.paidThroughAt).toBe(iso(END))
  })
})
