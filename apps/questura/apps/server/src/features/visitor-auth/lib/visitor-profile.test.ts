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
