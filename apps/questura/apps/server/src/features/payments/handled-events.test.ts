import { describe, expect, it } from 'vitest'
import {
  DELIBERATELY_UNHANDLED_STRIPE_EVENTS,
  HANDLED_STRIPE_EVENT_TYPES,
  STRIPE_WEBHOOK_HANDLERS,
  isHandledStripeEventType,
} from '@/payments/webhooks/handled-events'

describe('stripe webhook event contract', () => {
  // This list is what `verify-stripe-webhook-events.ts` diffs the live endpoint
  // against, so a silent change here would quietly widen or narrow what the
  // deploy check considers correct. Pinned deliberately.
  it('handles exactly the events the endpoint is verified against', () => {
    expect([...HANDLED_STRIPE_EVENT_TYPES].sort()).toEqual([
      'charge.dispute.closed',
      'charge.dispute.created',
      'charge.refunded',
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.deleted',
      'customer.subscription.updated',
      'invoice.payment_failed',
      'invoice.payment_succeeded',
    ])
  })

  // The revocation path is the one that was dead in production. If any of these
  // three ever leaves the dispatch, refunds and chargebacks stop revoking.
  it('routes the revocation events', () => {
    expect(isHandledStripeEventType('charge.refunded')).toBe(true)
    expect(isHandledStripeEventType('charge.dispute.created')).toBe(true)
    expect(isHandledStripeEventType('charge.dispute.closed')).toBe(true)
  })

  it('rejects an event type it does not dispatch', () => {
    expect(isHandledStripeEventType('customer.updated')).toBe(false)
    expect(isHandledStripeEventType('')).toBe(false)
  })

  it('derives the verified list from the dispatch itself', () => {
    expect(HANDLED_STRIPE_EVENT_TYPES).toHaveLength(Object.keys(STRIPE_WEBHOOK_HANDLERS).length)
    for (const type of HANDLED_STRIPE_EVENT_TYPES) {
      expect(typeof STRIPE_WEBHOOK_HANDLERS[type]).toBe('function')
    }
  })

  // "Decided against" and "handled" must stay disjoint, or the script would
  // report an event as both missing and deliberately skipped.
  it('does not record a handled event as deliberately unhandled', () => {
    for (const type of Object.keys(DELIBERATELY_UNHANDLED_STRIPE_EVENTS)) {
      expect(isHandledStripeEventType(type)).toBe(false)
    }
  })

  it('gives a reason for every event it decided against', () => {
    for (const [type, reason] of Object.entries(DELIBERATELY_UNHANDLED_STRIPE_EVENTS)) {
      expect(reason.length, `${type} needs a reason`).toBeGreaterThan(20)
    }
  })

  // Inherited from the object literal, not an event Stripe would ever send.
  it('does not treat inherited object keys as handled events', () => {
    expect(isHandledStripeEventType('toString')).toBe(false)
    expect(isHandledStripeEventType('constructor')).toBe(false)
  })
})
