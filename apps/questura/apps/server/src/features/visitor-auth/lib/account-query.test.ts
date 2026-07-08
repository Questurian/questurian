import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  listUserAccounts: vi.fn(),
}))

vi.mock('./better-auth', () => ({
  visitorAuth: {
    $context: Promise.resolve({
      internalAdapter: {
        findUserByEmail: mocks.findUserByEmail,
      },
    }),
    api: {
      listUserAccounts: mocks.listUserAccounts,
    },
  },
}))

import { deriveAuthMethods, findVisitorAccountByEmail, getVisitorAuthMethods } from './account-query'

describe('Visitor account query', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findUserByEmail.mockResolvedValue(null)
    mocks.listUserAccounts.mockResolvedValue([])
  })

  it.each([
    [['credential'], 'local'],
    [['google'], 'google'],
    [['credential', 'google'], 'dual'],
    [[], 'unknown'],
  ] as const)('derives %j as %s', (providerIds, authProvider) => {
    expect(deriveAuthMethods([...providerIds])).toMatchObject({ authProvider })
  })

  it('ignores empty provider ids', () => {
    expect(deriveAuthMethods([null, undefined, ''])).toEqual({
      hasLocalPassword: false,
      hasGoogleOAuth: false,
      authProvider: 'unknown',
    })
  })

  it('finds an account and its methods through the BetterAuth adapter', async () => {
    mocks.findUserByEmail.mockResolvedValue({
      user: { id: 'visitor_1', email: 'ada@example.com' },
      accounts: [{ providerId: 'credential' }, { providerId: 'google' }],
    })

    await expect(findVisitorAccountByEmail('ada@example.com')).resolves.toEqual({
      exists: true,
      methods: {
        hasLocalPassword: true,
        hasGoogleOAuth: true,
        authProvider: 'dual',
      },
    })
  })

  it('reports a user with no linked accounts as existing with unknown provider', async () => {
    mocks.findUserByEmail.mockResolvedValue({
      user: { id: 'visitor_1', email: 'ada@example.com' },
      accounts: [],
    })

    await expect(findVisitorAccountByEmail('ada@example.com')).resolves.toEqual({
      exists: true,
      methods: {
        hasLocalPassword: false,
        hasGoogleOAuth: false,
        authProvider: 'unknown',
      },
    })
  })

  it('reports a missing account when no user matches', async () => {
    await expect(findVisitorAccountByEmail('nobody@example.com')).resolves.toEqual({
      exists: false,
      methods: null,
    })
  })

  it('resolves session auth methods via listUserAccounts', async () => {
    mocks.listUserAccounts.mockResolvedValue([{ providerId: 'google' }])

    await expect(getVisitorAuthMethods(new Headers())).resolves.toEqual({
      hasLocalPassword: false,
      hasGoogleOAuth: true,
      authProvider: 'google',
    })
  })

  it('falls back to unknown methods when the session lookup fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.listUserAccounts.mockRejectedValue(new Error('no session'))

    await expect(getVisitorAuthMethods(new Headers())).resolves.toEqual({
      hasLocalPassword: false,
      hasGoogleOAuth: false,
      authProvider: 'unknown',
    })

    consoleError.mockRestore()
  })
})
