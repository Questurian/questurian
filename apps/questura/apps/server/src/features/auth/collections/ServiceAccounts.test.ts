import { describe, expect, it } from 'vitest'

import { ServiceAccounts } from './ServiceAccounts'

const access = ServiceAccounts.access as Record<string, (args: unknown) => unknown>
const OPERATIONS = ['admin', 'read', 'create', 'update', 'delete'] as const

const humanAdmin = { id: 1, collection: 'users', role: 'admin', status: 'active' }

describe('ServiceAccounts collection', () => {
  it('authenticates by API key only, with no password to leak', () => {
    expect(ServiceAccounts.auth).toMatchObject({
      useAPIKey: true,
      disableLocalStrategy: true,
    })
  })

  /**
   * ADR-0006: the exclusion of service accounts from staff surfaces is
   * structural. These fields not existing is what makes it impossible for a
   * machine to show up in the staff list or get an author page.
   */
  it('carries no role and no authorship', () => {
    const names = (ServiceAccounts.fields as Array<{ name?: string }>).map((f) => f.name)

    expect(names).not.toContain('role')
    expect(names).not.toContain('slug')
    expect(names).not.toContain('authorSlug')
    expect(names).not.toContain('publicProfile')
    expect(names).toEqual(['name', 'description'])
  })
})

describe('ServiceAccounts access', () => {
  it('grants every operation to an active human admin', () => {
    for (const operation of OPERATIONS) {
      expect(access[operation]({ req: { user: humanAdmin } })).toBe(true)
    }
  })

  it('denies anonymous callers', () => {
    for (const operation of OPERATIONS) {
      expect(access[operation]({ req: { user: null } })).toBe(false)
    }
  })

  it('denies non-admin staff', () => {
    for (const role of ['editor', 'writer']) {
      for (const operation of OPERATIONS) {
        expect(
          access[operation]({ req: { user: { id: 2, collection: 'users', role, status: 'active' } } }),
        ).toBe(false)
      }
    }
  })

  it('denies a disabled admin', () => {
    const user = { ...humanAdmin, status: 'disabled' }

    for (const operation of OPERATIONS) {
      expect(access[operation]({ req: { user } })).toBe(false)
    }
  })

  /**
   * Holding one key must never be a route to reading or minting another, so a
   * service account is denied even against its own collection.
   */
  it('denies service accounts, including for their own collection', () => {
    const user = { id: 3, collection: 'service-accounts', name: 'Location Manager' }

    for (const operation of OPERATIONS) {
      expect(access[operation]({ req: { user } })).toBe(false)
    }
  })

  it('denies a caller from another collection even if it somehow carries an admin role', () => {
    const user = { id: 4, collection: 'service-accounts', role: 'admin' }

    for (const operation of OPERATIONS) {
      expect(access[operation]({ req: { user } })).toBe(false)
    }
  })
})
