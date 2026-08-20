import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({
  getPayload: vi.fn(),
}))

vi.mock('@/payload.config', () => ({
  default: {},
}))

import { getPayload } from 'payload'
import {
  ensureVisitorProfileForAuthUser,
  findVisitorProfileByAuthUserId,
  findVisitorProfileByStripeCustomerId,
  updateVisitorProfileByAuthUserId,
} from './visitor-profile'

const payload = {
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}

describe('Visitor profile system helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPayload).mockResolvedValue(payload as never)
    payload.find.mockResolvedValue({ docs: [] })
  })

  it('reads VisitorProfiles by auth user id with system access', async () => {
    await findVisitorProfileByAuthUserId('auth_123')

    expect(payload.find).toHaveBeenCalledWith({
      collection: 'visitor-profiles',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        authUserId: { equals: 'auth_123' },
      },
    })
  })

  it('reads VisitorProfiles by Stripe customer id with system access', async () => {
    await findVisitorProfileByStripeCustomerId('cus_123')

    expect(payload.find).toHaveBeenCalledWith({
      collection: 'visitor-profiles',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        stripeCustomerId: { equals: 'cus_123' },
      },
    })
  })

  it('creates missing VisitorProfiles with system access', async () => {
    payload.create.mockResolvedValue({
      id: 1,
      authUserId: 'auth_123',
      email: 'visitor@example.com',
    })

    await ensureVisitorProfileForAuthUser({
      id: 'auth_123',
      email: 'Visitor@Example.com',
      name: 'Ada Lovelace',
    })

    expect(payload.create).toHaveBeenCalledWith({
      collection: 'visitor-profiles',
      data: {
        authUserId: 'auth_123',
        email: 'visitor@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        subscriptionStatus: 'none',
        cancelAtPeriodEnd: false,
      },
      overrideAccess: true,
    })
  })

  it('returns the winner\'s profile when a concurrent request created it first', async () => {
    // `authUserId` is unique, so the losing create is refused. The row it wanted
    // exists, so this is not an error to hand back to `/api/me` -- a 500 there
    // reads as anonymous on the client and shows a member the paywall.
    payload.find
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ id: 7, authUserId: 'auth_123' }] })
    payload.create.mockRejectedValue(new Error('duplicate key value violates unique constraint'))

    const profile = await ensureVisitorProfileForAuthUser({
      id: 'auth_123',
      email: 'visitor@example.com',
      name: 'Ada Lovelace',
    })

    expect(profile).toEqual({ id: 7, authUserId: 'auth_123' })
  })

  it('rethrows a create failure that is not a lost race', async () => {
    payload.find.mockResolvedValue({ docs: [] })
    payload.create.mockRejectedValue(new Error('connection terminated'))

    await expect(
      ensureVisitorProfileForAuthUser({ id: 'auth_123', email: 'visitor@example.com', name: '' })
    ).rejects.toThrow('connection terminated')
  })

  it('updates existing VisitorProfiles with system access', async () => {
    payload.find.mockResolvedValue({
      docs: [{ id: 42, authUserId: 'auth_123' }],
    })

    await updateVisitorProfileByAuthUserId('auth_123', {
      stripeCustomerId: 'cus_123',
    })

    expect(payload.update).toHaveBeenCalledWith({
      collection: 'visitor-profiles',
      id: 42,
      data: {
        stripeCustomerId: 'cus_123',
      },
      overrideAccess: true,
    })
  })
})
