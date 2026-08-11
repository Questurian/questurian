import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
}))

vi.mock('./better-auth', () => ({
  visitorAuth: {
    $context: Promise.resolve({
      internalAdapter: {
        findUserByEmail: mocks.findUserByEmail,
      },
    }),
  },
}))

import { accountCheckFromLookup, assertValidEmail, checkVisitorAccount } from './legacy-auth-compat'

describe('Legacy auth compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findUserByEmail.mockResolvedValue(null)
  })

  it('maps missing Visitor account to legacy account-check shape', () => {
    expect(accountCheckFromLookup({ exists: false, methods: null })).toEqual({
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

  it('maps BetterAuth auth methods to legacy auth method flags', () => {
    expect(accountCheckFromLookup({
      exists: true,
      methods: {
        hasLocalPassword: true,
        hasGoogleOAuth: true,
        authProvider: 'dual',
      },
    })).toEqual({
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

  it('checks accounts through the BetterAuth adapter, not raw SQL', async () => {
    mocks.findUserByEmail.mockResolvedValue({
      user: { id: 'visitor_1', email: 'ada@example.com' },
      accounts: [{ providerId: 'credential' }],
    })

    const result = await checkVisitorAccount(' ADA@Example.COM ')

    expect(mocks.findUserByEmail).toHaveBeenCalledWith('ada@example.com', { includeAccounts: true })
    expect(result).toMatchObject({
      exists: true,
      authMethods: { hasPassword: true, hasGoogle: false },
      user: { authProvider: 'local' },
    })
  })

  it('reports a missing account when BetterAuth finds no user', async () => {
    const result = await checkVisitorAccount('nobody@example.com')

    expect(result).toEqual({
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

  it('normalizes and validates email input', () => {
    expect(assertValidEmail(' ADA@Example.COM ')).toBe('ada@example.com')
    expect(() => assertValidEmail('not-an-email')).toThrow('Please enter a valid email address')
  })
})
