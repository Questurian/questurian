import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listUserAccounts: vi.fn(),
  findAccounts: vi.fn(),
  payloadAuth: vi.fn(),
  findVisitorProfileByAuthUserId: vi.fn(),
  ensureVisitorProfileForAuthUser: vi.fn(),
  isRecentlyRevoked: vi.fn(),
}))

vi.mock('./session-revocations', () => ({
  sessionRevocations: { isRecentlyRevoked: mocks.isRecentlyRevoked, record: vi.fn() },
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
    mocks.isRecentlyRevoked.mockResolvedValue(false)
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

  // Payment routes must refuse a session revoked on another device at once,
  // not up to five minutes later when the cookie cache expires.
  it('bypasses the session cookie cache only when asked for a fresh session', async () => {
    const headers = new Headers({ cookie: 'questura_visitor.session_token=x.y' })

    await getCurrentPrincipal(headers)
    await requireVisitorPrincipal(headers, { freshSession: true })

    expect(mocks.getSession.mock.calls[0][0]).toEqual({ headers })
    expect(mocks.getSession.mock.calls[1][0]).toEqual({ headers, query: { disableCookieCache: true } })
  })

  // A session revoked on another device (password change or reset, sign out
  // of all devices) must end within about a second, not when that device's
  // five-minute cookie copy runs out.
  describe('after a revocation', () => {
    const headers = new Headers({ cookie: 'questura_visitor.session_token=tok.sig' })
    const cached = {
      session: { token: 'tok', userId: 'visitor_1' },
      user: { id: 'visitor_1', email: 'v@example.com', emailVerified: true, name: 'V' },
    }

    it('trusts the cookie copy of a reader with no recent revocation, with no second lookup', async () => {
      mocks.getSession.mockResolvedValue(cached)
      mocks.findVisitorProfileByAuthUserId.mockResolvedValue({ id: 1 })

      const result = await getCurrentPrincipal(headers)

      expect(result.authenticated).toBe(true)
      expect(mocks.getSession).toHaveBeenCalledTimes(1)
      expect(mocks.isRecentlyRevoked).toHaveBeenCalledWith('visitor_1')
    })

    it('asks the session store for a reader revoked recently, and a revoked session is signed out', async () => {
      mocks.isRecentlyRevoked.mockResolvedValue(true)
      mocks.getSession.mockResolvedValueOnce(cached).mockResolvedValueOnce(null)

      const result = await getCurrentPrincipal(headers)

      expect(result).toEqual({ authenticated: false, principal: null })
      expect(mocks.getSession.mock.calls[1][0]).toEqual({ headers, query: { disableCookieCache: true } })
    })

    it('keeps a session the store still honours (the device that changed the password)', async () => {
      mocks.isRecentlyRevoked.mockResolvedValue(true)
      mocks.getSession.mockResolvedValue(cached)
      mocks.findVisitorProfileByAuthUserId.mockResolvedValue({ id: 1 })

      const result = await getCurrentPrincipal(headers)

      expect(result.principal?.id).toBe('visitor_1')
      expect(mocks.getSession).toHaveBeenCalledTimes(2)
    })

    it('covers the sign-in methods read too', async () => {
      mocks.isRecentlyRevoked.mockResolvedValue(true)
      mocks.getSession.mockResolvedValueOnce(cached).mockResolvedValueOnce(null)

      expect(await getCurrentAuthMethods(headers)).toBeNull()
      expect(mocks.findAccounts).not.toHaveBeenCalled()
    })

    it('does not consult the list when the store is asked anyway', async () => {
      mocks.getSession.mockResolvedValue(cached)
      mocks.findVisitorProfileByAuthUserId.mockResolvedValue({ id: 1 })

      await requireVisitorPrincipal(headers, { freshSession: true })

      expect(mocks.isRecentlyRevoked).not.toHaveBeenCalled()
      expect(mocks.getSession).toHaveBeenCalledTimes(1)
    })
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
          interval: null,
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

// Better Auth trusts a valid session_data cookie without checking it belongs
// to the session_token beside it (found by `pnpm readiness:auth`): A's cache
// cookie with B's token was read as A.
describe('cookie cache that does not match the session token', () => {
  const user = (id: string) => ({ id, email: `${id}@example.com`, emailVerified: true, name: id })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findAccounts.mockResolvedValue([])
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({ id: 1, firstName: '', lastName: '' })
  })

  it('is not trusted: the session is looked up fresh from the token', async () => {
    mocks.getSession
      .mockResolvedValueOnce({ session: { token: 'token_A' }, user: user('visitor_A') })
      .mockResolvedValueOnce({ session: { token: 'token_B' }, user: user('visitor_B') })

    const result = await getCurrentPrincipal(new Headers({ cookie: 'questura_visitor.session_token=token_B.sig' }))

    expect(mocks.getSession).toHaveBeenCalledTimes(2)
    expect(mocks.getSession.mock.calls[1]![0]).toMatchObject({ query: { disableCookieCache: true } })
    expect(result.principal?.id).toBe('visitor_B')
  })

  it('with no session token at all, is not trusted either', async () => {
    mocks.getSession
      .mockResolvedValueOnce({ session: { token: 'token_A' }, user: user('visitor_A') })
      .mockResolvedValueOnce(null)

    const result = await getCurrentPrincipal(new Headers({ cookie: 'questura_visitor.session_data=cached' }))

    expect(result.principal).toBeNull()
  })

  it('costs nothing extra when cache and token agree', async () => {
    mocks.getSession.mockResolvedValue({ session: { token: 'token_A' }, user: user('visitor_A') })

    const result = await getCurrentPrincipal(new Headers({ cookie: '__Secure-questura_visitor.session_token=token_A.sig' }))

    expect(mocks.getSession).toHaveBeenCalledTimes(1)
    expect(result.principal?.id).toBe('visitor_A')
  })
})
