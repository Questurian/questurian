import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listUserAccounts: vi.fn(),
  findAccounts: vi.fn(),
  payloadAuth: vi.fn(),
  findVisitorProfileByAuthUserId: vi.fn(),
  ensureVisitorProfileForAuthUser: vi.fn(),
}))

vi.mock('./better-auth', () => ({
  visitorAuth: {
    api: {
      getSession: mocks.getSession,
      listUserAccounts: mocks.listUserAccounts,
    },
    $context: Promise.resolve({ internalAdapter: { findAccounts: mocks.findAccounts } }),
  },
}))

vi.mock('payload', () => ({
  getPayload: vi.fn().mockResolvedValue({
    auth: mocks.payloadAuth,
  }),
}))

vi.mock('@/payload.config', () => ({
  default: {},
}))

vi.mock('./visitor-profile', () => ({
  findVisitorProfileByAuthUserId: mocks.findVisitorProfileByAuthUserId,
  ensureVisitorProfileForAuthUser: mocks.ensureVisitorProfileForAuthUser,
}))

import { getCurrentAuthMethods, getCurrentPrincipal, requireVisitorPrincipal } from './current-principal'

describe('Current principal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue(null)
    mocks.listUserAccounts.mockResolvedValue([])
    mocks.findAccounts.mockResolvedValue([])
    mocks.payloadAuth.mockResolvedValue({ user: null })
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(null)
    mocks.ensureVisitorProfileForAuthUser.mockResolvedValue(null)
  })

  // Every signed-in page view asks /api/me. `listUserAccounts({ headers })`
  // resolved the session a second time just to learn the user id this lookup
  // already had.
  it('resolves the session once per signed-in request', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'visitor_1', email: 'v@example.com', emailVerified: true, name: 'V' },
    })
    mocks.findAccounts.mockResolvedValue([{ providerId: 'credential' }])
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({ id: 1, firstName: 'V', lastName: '' })

    const result = await getCurrentPrincipal(new Headers({ cookie: 'questura_visitor.session_token=x.y' }))

    expect(mocks.getSession).toHaveBeenCalledTimes(1)
    expect(mocks.listUserAccounts).not.toHaveBeenCalled()
    expect(result.principal?.id).toBe('visitor_1')
  })

  // Every gate and every /api/me resolves a principal; only the account page
  // needs sign-in methods. The accounts query is one statement those callers
  // no longer pay.
  it('makes no accounts query when resolving a principal', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'visitor_1', email: 'v@example.com', emailVerified: true, name: 'V' },
    })
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({ id: 1, firstName: 'V', lastName: '' })

    const cookie = new Headers({ cookie: 'questura_visitor.session_token=x.y' })
    await getCurrentPrincipal(cookie)
    await requireVisitorPrincipal(cookie, { requireVerified: true })

    expect(mocks.findAccounts).not.toHaveBeenCalled()
    expect(mocks.listUserAccounts).not.toHaveBeenCalled()
  })

  it('reads sign-in methods with one session lookup and the accounts query', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'visitor_1', email: 'v@example.com', emailVerified: true, name: 'V' },
    })
    mocks.findAccounts.mockResolvedValue([{ providerId: 'credential' }])

    const methods = await getCurrentAuthMethods(new Headers({ cookie: 'questura_visitor.session_token=x.y' }))

    expect(methods).toEqual({ hasLocalPassword: true, hasGoogleOAuth: false, authProvider: 'local' })
    expect(mocks.getSession).toHaveBeenCalledTimes(1)
    expect(mocks.findAccounts).toHaveBeenCalledWith('visitor_1')
    expect(mocks.listUserAccounts).not.toHaveBeenCalled()
    expect(mocks.findVisitorProfileByAuthUserId).not.toHaveBeenCalled()
  })

  it('has no sign-in methods for an anonymous caller', async () => {
    expect(await getCurrentAuthMethods(new Headers())).toBeNull()
    expect(mocks.findAccounts).not.toHaveBeenCalled()
  })

  it('does no account or profile work for an anonymous caller', async () => {
    const result = await getCurrentPrincipal(new Headers())

    expect(result).toEqual({ authenticated: false, principal: null })
    expect(mocks.findAccounts).not.toHaveBeenCalled()
    expect(mocks.findVisitorProfileByAuthUserId).not.toHaveBeenCalled()
    expect(mocks.ensureVisitorProfileForAuthUser).not.toHaveBeenCalled()
  })

  it('returns a Visitor principal from a BetterAuth session', async () => {
    mocks.getSession.mockResolvedValue({
      user: {
        id: 'visitor_123',
        email: 'visitor@example.com',
        emailVerified: true,
        name: 'Ada Lovelace',
      },
    })
    mocks.findAccounts.mockResolvedValue([
      { providerId: 'credential' },
      { providerId: 'google' },
    ])
    const paidThroughAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      id: 10,
      firstName: 'Ada',
      lastName: 'Lovelace',
      subscriptionStatus: 'active',
      paidThroughAt,
      cancelAtPeriodEnd: false,
    })

    const result = await getCurrentPrincipal(new Headers())

    expect(result).toEqual({
      authenticated: true,
      principal: {
        kind: 'visitor',
        id: 'visitor_123',
        email: 'visitor@example.com',
        emailVerified: true,
        profileId: 10,
        firstName: 'Ada',
        lastName: 'Lovelace',
        membership: {
          active: true,
          source: 'stripe',
          status: 'active',
          expiresAt: paidThroughAt,
          graceUntil: null,
          cancelAtPeriodEnd: false,
        },
      },
    })
  })

  it('self-heals a missing VisitorProfile for a valid Visitor session', async () => {
    mocks.getSession.mockResolvedValue({
      user: {
        id: 'visitor_123',
        email: 'visitor@example.com',
        emailVerified: false,
        name: 'Ada Lovelace',
      },
    })
    mocks.ensureVisitorProfileForAuthUser.mockResolvedValue({
      id: 11,
      firstName: 'Ada',
      lastName: 'Lovelace',
      subscriptionStatus: 'none',
      cancelAtPeriodEnd: false,
    })

    const result = await getCurrentPrincipal(new Headers())

    expect(mocks.ensureVisitorProfileForAuthUser).toHaveBeenCalledWith({
      id: 'visitor_123',
      email: 'visitor@example.com',
      name: 'Ada Lovelace',
    })
    expect(result.principal).toMatchObject({
      kind: 'visitor',
      profileId: 11,
      emailVerified: false,
    })
  })

  it('ignores Payload Staff auth for the public current principal', async () => {
    mocks.payloadAuth.mockResolvedValue({
      user: {
        id: 7,
        email: 'editor@questurian.com',
        role: 'editor',
      },
    })

    const result = await getCurrentPrincipal(new Headers())

    expect(result).toEqual({
      authenticated: false,
      principal: null,
    })
    expect(mocks.payloadAuth).not.toHaveBeenCalled()
  })

  it('returns the Visitor principal when Visitor and Staff auth are both present', async () => {
    mocks.getSession.mockResolvedValue({
      user: {
        id: 'visitor_123',
        email: 'visitor@example.com',
        emailVerified: true,
        name: 'Ada Lovelace',
      },
    })
    mocks.ensureVisitorProfileForAuthUser.mockResolvedValue({
      id: 11,
      subscriptionStatus: 'none',
    })
    mocks.payloadAuth.mockResolvedValue({
      user: {
        id: 7,
        email: 'editor@questurian.com',
        role: 'editor',
      },
    })

    const result = await getCurrentPrincipal(new Headers())

    expect(result.principal).toMatchObject({
      kind: 'visitor',
      id: 'visitor_123',
      email: 'visitor@example.com',
    })
    expect(mocks.payloadAuth).not.toHaveBeenCalled()
  })

  it('treats Staff-only auth as logged out for Visitor-only flows', async () => {
    mocks.payloadAuth.mockResolvedValue({
      user: {
        id: 7,
        email: 'editor@questurian.com',
        role: 'editor',
      },
    })

    const result = await requireVisitorPrincipal(new Headers())

    expect(result).toMatchObject({
      principal: null,
      error: 'Authentication required',
      status: 401,
    })
    expect(mocks.payloadAuth).not.toHaveBeenCalled()
  })

  it('rejects unverified Visitor accounts when verification is required', async () => {
    mocks.getSession.mockResolvedValue({
      user: {
        id: 'visitor_123',
        email: 'visitor@example.com',
        emailVerified: false,
        name: 'Ada Lovelace',
      },
    })
    mocks.ensureVisitorProfileForAuthUser.mockResolvedValue({
      id: 11,
      subscriptionStatus: 'none',
    })

    const result = await requireVisitorPrincipal(new Headers(), { requireVerified: true })

    expect(result).toMatchObject({
      principal: null,
      error: 'Email verification required',
      status: 403,
    })
  })
})
