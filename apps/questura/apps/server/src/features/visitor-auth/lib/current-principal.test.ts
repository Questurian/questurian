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

import {
  getCurrentPrincipal,
  requireStaffPrincipal,
  requireVisitorPrincipal,
} from './current-principal'

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
    mocks.findVisitorProfileByAuthUserId.mockResolvedValue({
      id: 10,
      firstName: 'Ada',
      lastName: 'Lovelace',
      subscriptionStatus: 'active',
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
          expiresAt: null,
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

  it('returns Staff identity and staff grant from Payload auth when no Visitor session exists', async () => {
    mocks.payloadAuth.mockResolvedValue({
      user: {
        id: 7,
        email: 'editor@questurian.com',
        role: 'editor',
      },
    })

    const result = await getCurrentPrincipal(new Headers())

    expect(result).toEqual({
      authenticated: true,
      principal: {
        kind: 'staff',
        id: 7,
        email: 'editor@questurian.com',
        role: 'editor',
        membership: {
          active: true,
          source: 'staff_grant',
        },
      },
    })
  })

  it('rejects Staff identity for Visitor-only flows', async () => {
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
      error: 'Visitor account required',
      status: 403,
    })
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

  it('rejects Visitor principals for Staff-only flows', async () => {
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

    const result = await requireStaffPrincipal(new Headers(), ['admin'])

    expect(result).toMatchObject({
      principal: null,
      error: 'Access denied. Required roles: admin',
      status: 403,
    })
  })
})
