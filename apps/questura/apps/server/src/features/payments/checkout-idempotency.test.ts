import { describe, expect, it } from 'vitest'
import {
  CHECKOUT_IDEMPOTENCY_WINDOW_MS,
  checkoutIdempotencyKey,
  type CheckoutIdempotencyInput,
} from '@/payments/lib/checkout-idempotency'

const BASE: CheckoutIdempotencyInput = {
  visitorAuthUserId: 'visitor_123',
  customerId: 'cus_123',
  priceId: 'price_monthly',
  successUrl: 'https://questurian.com/subscription/success?returnTo=%2Fcity',
  cancelUrl: 'https://questurian.com/subscription/cancel',
  referralId: null,
  allowPromotionCodes: false,
  forceThreeDSecure: false,
}

/**
 * Anchored to the start of a bucket, not to an arbitrary instant. A mid-bucket
 * anchor makes "now + window - 1ms" straddle the boundary, which would make the
 * replay assertions depend on where in the bucket the constant happened to land.
 */
const BUCKET_START =
  Math.floor(1_760_000_000_000 / CHECKOUT_IDEMPOTENCY_WINDOW_MS) * CHECKOUT_IDEMPOTENCY_WINDOW_MS

function keyAt(overrides: Partial<CheckoutIdempotencyInput>, now = BUCKET_START) {
  return checkoutIdempotencyKey({ ...BASE, ...overrides }, now)
}

describe('checkoutIdempotencyKey', () => {
  // The whole point of bucketing: Stripe replays a key for 24h and a Checkout
  // Session expires in about the same time, so an unbucketed key could hand a
  // returning visitor a session that is already dead.
  it('replays for the whole window and no longer', () => {
    const first = keyAt({})

    expect(keyAt({}, BUCKET_START + 1)).toBe(first)
    expect(keyAt({}, BUCKET_START + CHECKOUT_IDEMPOTENCY_WINDOW_MS - 1)).toBe(first)
    expect(keyAt({}, BUCKET_START + CHECKOUT_IDEMPOTENCY_WINDOW_MS)).not.toBe(first)
  })

  it('keeps the replay window far shorter than a session’s ~24h expiry', () => {
    expect(CHECKOUT_IDEMPOTENCY_WINDOW_MS).toBeLessThan(60 * 60 * 1000)
  })

  // Stripe rejects a reused key whose request body changed, so anything the
  // caller can vary has to move the key. Each of these would be a hard 500
  // otherwise.
  it.each([
    ['a different plan', { priceId: 'price_yearly' }],
    ['a different return path', { successUrl: 'https://questurian.com/subscription/success?returnTo=%2Fother' }],
    ['a different cancel URL', { cancelUrl: 'https://questurian.com/elsewhere' }],
    ['a referral appearing', { referralId: 'ref_abc' }],
    ['promotion codes being enabled', { allowPromotionCodes: true }],
    ['forced card authentication being enabled', { forceThreeDSecure: true }],
    ['a different customer', { customerId: 'cus_other' }],
    ['a different visitor', { visitorAuthUserId: 'visitor_999' }],
  ] as const)('produces a different key for %s', (_label, overrides) => {
    expect(keyAt(overrides)).not.toBe(keyAt({}))
  })

  it('does not collide when a field value straddles the separator', () => {
    expect(keyAt({ visitorAuthUserId: 'a', customerId: 'b' })).not.toBe(
      keyAt({ visitorAuthUserId: 'ab', customerId: '' })
    )
  })

  it('stays inside Stripe’s 255-character key limit', () => {
    const key = keyAt({ referralId: 'x'.repeat(100) })

    expect(key.length).toBeLessThanOrEqual(255)
    expect(key.startsWith('checkout:')).toBe(true)
  })

  it('leaks no identifiers into the key itself', () => {
    const key = keyAt({ referralId: 'ref_abc' })

    expect(key).not.toContain('visitor_123')
    expect(key).not.toContain('cus_123')
    expect(key).not.toContain('ref_abc')
  })
})
