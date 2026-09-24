import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A double-clicked Subscribe on a visitor's first purchase.
 *
 * Found by `pnpm readiness:purchase`. Both requests looked the visitor up in
 * Stripe, found nobody and each created a customer. The Checkout idempotency
 * key includes the customer id, so it could not help: two customers, two
 * sessions. The profile kept whichever link was written last, the buyer paid
 * on either one, and half the time `checkout.session.completed` was refused
 * ("customer disagrees with the profile linkage") — charged, never a member.
 */

const created = vi.hoisted(() => [] as Array<{ params: Record<string, unknown>; options?: { idempotencyKey?: string } }>)

vi.mock('./stripe', () => ({
  stripe: {
    customers: {
      list: vi.fn(async () => ({ data: [] })),
      create: vi.fn(async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        created.push({ params, options })
        return { id: `cus_${created.length}` }
      }),
    },
  },
}))

import { resolveStripeCustomerForVisitor } from './customer-linkage'

const visitor = { email: 'reader@example.com', visitorAuthUserId: 'auth_1', visitorProfileId: 7, name: 'Reader One' }

describe('resolveStripeCustomerForVisitor, creating a customer', () => {
  beforeEach(() => {
    created.length = 0
  })

  it('sends an idempotency key, so two simultaneous requests get one customer', async () => {
    await Promise.all([resolveStripeCustomerForVisitor(visitor), resolveStripeCustomerForVisitor(visitor)])

    const keys = created.map((call) => call.options?.idempotencyKey)
    expect(keys[0]).toBeTruthy()
    expect(keys[0]).toBe(keys[1])
  })

  it('keys by visitor, so two visitors never share a customer', async () => {
    await resolveStripeCustomerForVisitor(visitor)
    await resolveStripeCustomerForVisitor({ ...visitor, visitorAuthUserId: 'auth_2' })

    expect(created[0]!.options!.idempotencyKey).not.toBe(created[1]!.options!.idempotencyKey)
  })

  // Stripe refuses a reused key whose parameters differ. A changed name or
  // address must get a new key rather than a failed checkout.
  it('changes the key when the parameters change', async () => {
    await resolveStripeCustomerForVisitor(visitor)
    await resolveStripeCustomerForVisitor({ ...visitor, name: 'Reader Renamed' })
    await resolveStripeCustomerForVisitor({ ...visitor, email: 'new@example.com' })

    expect(new Set(created.map((call) => call.options!.idempotencyKey)).size).toBe(3)
  })

  it('does not put the email address in the key', async () => {
    await resolveStripeCustomerForVisitor(visitor)

    expect(created[0]!.options!.idempotencyKey).not.toContain('reader@example.com')
  })
})
