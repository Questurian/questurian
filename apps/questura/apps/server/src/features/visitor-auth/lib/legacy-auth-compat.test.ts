import { describe, expect, it } from 'vitest'

import { accountCheckFromRows, assertValidEmail, legacyUserFromPrincipal } from './legacy-auth-compat'

describe('Legacy auth compatibility', () => {
  it('maps missing Visitor account to legacy account-check shape', () => {
    expect(accountCheckFromRows([])).toEqual({
      exists: false,
      authMethods: {
        local: false,
        google: false,
        hasPassword: false,
        hasGoogle: false,
      },
      user: null,
    })
  })

  it('maps BetterAuth providers to legacy auth method flags', () => {
    expect(accountCheckFromRows([
      { id: 'visitor_1', email: 'ada@example.com', providerId: 'credential' },
      { id: 'visitor_1', email: 'ada@example.com', providerId: 'google' },
    ])).toEqual({
      exists: true,
      authMethods: {
        local: true,
        google: true,
        hasPassword: true,
        hasGoogle: true,
      },
      user: {
        role: 'visitor',
        authProvider: 'dual',
        isProtected: false,
      },
    })
  })

  it('normalizes and validates email input', () => {
    expect(assertValidEmail(' ADA@Example.COM ')).toBe('ada@example.com')
    expect(() => assertValidEmail('not-an-email')).toThrow('Please enter a valid email address')
  })

  it('maps Visitor principal to legacy user fields', () => {
    expect(legacyUserFromPrincipal({
      kind: 'visitor',
      id: 'visitor_1',
      email: 'ada@example.com',
      emailVerified: false,
      hasLocalPassword: true,
      hasGoogleOAuth: false,
      authProvider: 'local',
      profileId: 12,
      firstName: 'Ada',
      lastName: 'Lovelace',
      membership: {
        active: false,
        source: null,
        status: 'none',
        expiresAt: null,
        cancelAtPeriodEnd: false,
      },
    })).toMatchObject({
      kind: 'visitor',
      subscriptionStatus: 'none',
      membershipStatusSummary: 'none',
      membershipExpiration: null,
      cancelAtPeriodEnd: false,
    })
  })
})
