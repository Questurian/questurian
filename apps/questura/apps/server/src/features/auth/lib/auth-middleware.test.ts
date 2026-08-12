import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
}))

vi.mock('payload', () => ({
  getPayload: vi.fn().mockResolvedValue({ auth: mocks.auth }),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

import { authenticateRequest } from './auth-middleware'
import { LOCATION_MANAGER_SERVICE_ACCOUNT } from './service-account-grants'

const request = () => new NextRequest('http://localhost:4000/api/editorial')

describe('authenticateRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows Location Manager when the route requests its explicit capability', async () => {
    const user = {
      id: 1,
      collection: 'service-accounts',
      name: LOCATION_MANAGER_SERVICE_ACCOUNT,
    }
    mocks.auth.mockResolvedValue({ user })

    await expect(
      authenticateRequest(request(), {
        requireAuth: true,
        serviceAccountCapability: 'media-sets:from-source',
      }),
    ).resolves.toEqual({ user, error: null, status: 200 })
  })

  it('denies a service account when the route requests no machine capability', async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: 1,
        collection: 'service-accounts',
        name: LOCATION_MANAGER_SERVICE_ACCOUNT,
      },
    })

    await expect(authenticateRequest(request())).resolves.toMatchObject({
      user: null,
      status: 403,
    })
  })

  it('denies an unknown service account even on a machine-capable route', async () => {
    mocks.auth.mockResolvedValue({
      user: { id: 2, collection: 'service-accounts', name: 'Unknown integration' },
    })

    await expect(
      authenticateRequest(request(), {
        serviceAccountCapability: 'media-sets:from-source',
      }),
    ).resolves.toMatchObject({ user: null, status: 403 })
  })

  it('preserves active staff role authorization', async () => {
    const user = {
      id: 3,
      collection: 'users',
      role: 'editor',
      status: 'active',
    }
    mocks.auth.mockResolvedValue({ user })

    await expect(
      authenticateRequest(request(), { allowedRoles: ['admin', 'editor'] }),
    ).resolves.toEqual({ user, error: null, status: 200 })
  })

  it('still denies disabled staff', async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: 4,
        collection: 'users',
        role: 'admin',
        status: 'disabled',
      },
    })

    await expect(authenticateRequest(request())).resolves.toMatchObject({
      user: null,
      error: 'This account has been disabled',
      status: 403,
    })
  })
})
