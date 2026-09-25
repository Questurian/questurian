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
const replay = vi.hoisted(() => ({ keys: new Map<string, string>(), deleted: new Set<string>() }))

vi.mock('./stripe', () => ({
  stripe: {
    customers: {
      list: vi.fn(async () => ({ data: [] })),
      // Stripe replays a key's first response for 24 hours, even after that
      // customer has been deleted.
      create: vi.fn(async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        created.push({ params, options })
        const key = options?.idempotencyKey ?? `none_${created.length}`
        if (!replay.keys.has(key)) replay.keys.set(key, `cus_${created.length}`)
        return { id: replay.keys.get(key)! }
      }),
      retrieve: vi.fn(async (id: string) => (replay.deleted.has(id) ? { id, deleted: true } : { id })),
    },
  },
}))

import { resolveStripeCustomerForVisitor } from './customer-linkage'

const visitor = { email: 'reader@example.com', visitorAuthUserId: 'auth_1', visitorProfileId: 7, name: 'Reader One' }

describe('resolveStripeCustomerForVisitor, creating a customer', () => {
  beforeEach(() => {
    created.length = 0
    replay.keys.clear()
    replay.deleted.clear()
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

  // Launch fix plan item 11. A customer deleted in the Dashboard within a day of
  // being created: the next checkout's create replays that customer, and every
  // checkout after it answers 500 until the key expires.
  it('does not hand back a deleted customer that the idempotency key replays', async () => {
    const first = await resolveStripeCustomerForVisitor(visitor)
    replay.deleted.add(first.customerId)

    const again = await resolveStripeCustomerForVisitor(visitor)

    expect(again.customerId).not.toBe(first.customerId)
    expect(again.created).toBe(true)
  })
})
