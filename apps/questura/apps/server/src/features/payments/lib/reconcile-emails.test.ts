import { describe, expect, it, vi } from 'vitest'

import { reconcileCustomerEmails, type CustomerEmailView, type EmailSyncDeps, type LinkedReader } from './reconcile-emails'

function deps(readers: LinkedReader[], customers: CustomerEmailView[], current: Record<string, string | null> = {}) {
  const byId = new Map(customers.map((customer) => [customer.id, customer]))
  const updateCustomerEmail = vi.fn(async (id: string, email: string) => {
    byId.get(id)!.email = email
  })
  const value: EmailSyncDeps = {
    linkedReaders: async () => readers,
    customer: async (id) => byId.get(id) ?? null,
    currentEmail: async (authUserId) =>
      authUserId in current ? current[authUserId]! : (readers.find((r) => r.authUserId === authUserId)?.email ?? null),
    updateCustomerEmail,
  }
  return { value, updateCustomerEmail, byId }
}

const reader = (n: number, email = `new${n}@example.com`): LinkedReader => ({
  authUserId: `user_${n}`,
  stripeCustomerId: `cus_${n}`,
  email,
})
const customer = (n: number, email: string | null, owner: string | null = `user_${n}`): CustomerEmailView => ({
  id: `cus_${n}`,
  email,
  owner,
  deleted: false,
})

describe('reconcileCustomerEmails', () => {
  it('puts the account address back on a drifted customer, and leaves matching ones alone', async () => {
    const d = deps([reader(1), reader(2)], [customer(1, 'old1@example.com'), customer(2, 'NEW2@example.com ')])
    const result = await reconcileCustomerEmails(d.value, { apply: true, maxApply: 25 })

    expect(result.counts).toMatchObject({ email_checked: 2, email_drift: 1, email_synced: 1, email_failed: 0 })
    expect(d.updateCustomerEmail).toHaveBeenCalledTimes(1)
    expect(d.updateCustomerEmail).toHaveBeenCalledWith('cus_1', 'new1@example.com')
    expect(result.ok).toBe(true)
  })

  it('a dry run reports the drift and writes nothing', async () => {
    const d = deps([reader(1)], [customer(1, 'old1@example.com')])
    const result = await reconcileCustomerEmails(d.value, { apply: false, maxApply: 25 })

    expect(result.counts.email_drift).toBe(1)
    expect(result.counts.email_synced).toBe(0)
    expect(d.updateCustomerEmail).not.toHaveBeenCalled()
  })

  it('never writes to a customer that does not name the reader as its owner, or one that is gone', async () => {
    const d = deps(
      [reader(1), reader(2), reader(3)],
      [customer(1, 'someone@example.com', 'user_99'), customer(2, 'x@example.com', null), { ...customer(3, null), deleted: true }],
    )
    const result = await reconcileCustomerEmails(d.value, { apply: true, maxApply: 25 })

    expect(result.counts).toMatchObject({ email_not_owner: 2, email_missing: 1, email_drift: 0 })
    expect(d.updateCustomerEmail).not.toHaveBeenCalled()
  })

  it('writes the address as it is at write time, not as it was when the scan began', async () => {
    const d = deps([reader(1)], [customer(1, 'old1@example.com')], { user_1: 'newest1@example.com' })
    await reconcileCustomerEmails(d.value, { apply: true, maxApply: 25 })

    expect(d.updateCustomerEmail).toHaveBeenCalledWith('cus_1', 'newest1@example.com')
  })

  it('refuses a plan larger than the cap and writes nothing', async () => {
    const readers = [1, 2, 3].map((n) => reader(n))
    const d = deps(readers, [1, 2, 3].map((n) => customer(n, `old${n}@example.com`)))
    const result = await reconcileCustomerEmails(d.value, { apply: true, maxApply: 2 })

    expect(result.reason).toBe('email-cap-exceeded')
    expect(d.updateCustomerEmail).not.toHaveBeenCalled()
  })

  it('counts a Stripe failure and carries on with the rest', async () => {
    const d = deps([reader(1), reader(2)], [customer(1, 'old1@example.com'), customer(2, 'old2@example.com')])
    d.value.updateCustomerEmail = vi.fn(async (id: string) => {
      if (id === 'cus_1') throw new Error('Stripe is down')
    })
    const result = await reconcileCustomerEmails(d.value, { apply: true, maxApply: 25 })

    expect(result.counts).toMatchObject({ email_failed: 1, email_synced: 1 })
    expect(result.ok).toBe(false)
  })

  it('never prints an address', async () => {
    const d = deps([reader(1)], [customer(1, 'old1@example.com')])
    const result = await reconcileCustomerEmails(d.value, { apply: true, maxApply: 25 })

    expect(result.lines.join('\n')).not.toMatch(/@/)
  })
})
