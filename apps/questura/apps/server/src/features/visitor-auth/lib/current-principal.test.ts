import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listUserAccounts: vi.fn(),
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

import { getCurrentPrincipal, requireVisitorPrincipal } from './current-principal'

describe('Current principal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue(null)
    mocks.listUserAccounts.mockResolvedValue([])
    mocks.payloadAuth.mockResolvedValue({ user: null })
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue(null)
    mocks.ensureVisitorProfileForAuthUser.mockResolvedValue(null)
  })

  it('returns a Visitor principal and auth methods from a BetterAuth session', async () => {
    mocks.getSession.mockResolvedValue({
      user: {
        id: 'visitor_123',
        email: 'visitor@example.com',
        emailVerified: true,
        name: 'Ada Lovelace',
      },
    })
    mocks.listUserAccounts.mockResolvedValue([
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
        hasLocalPassword: true,
        hasGoogleOAuth: true,
        authProvider: 'dual',
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
