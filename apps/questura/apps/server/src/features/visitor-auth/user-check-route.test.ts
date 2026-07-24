import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertValidEmail: vi.fn(),
  checkVisitorAccount: vi.fn(),
  checkAccountCheckRateLimit: vi.fn(),
}))

vi.mock('./lib/legacy-auth-compat', () => ({
  assertValidEmail: mocks.assertValidEmail,
  checkVisitorAccount: mocks.checkVisitorAccount,
}))

vi.mock('./lib/account-check-rate-limit', () => ({
  checkAccountCheckRateLimit: mocks.checkAccountCheckRateLimit,
}))

import { POST } from '@/app/api/user/check/route'

function createRequest(origin: string) {
  return new Request('http://localhost:4000/api/user/check', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'x-forwarded-for': '192.0.2.30',
    },
    body: JSON.stringify({ email: ' ADA@example.com ' }),
  }) as any
}

describe('legacy user-check route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assertValidEmail.mockReturnValue('ada@example.com')
    mocks.checkAccountCheckRateLimit.mockResolvedValue({ allowed: true })
    mocks.checkVisitorAccount.mockResolvedValue({
      exists: true,
      authMethods: {
        local: true,
        google: false,
        hasPassword: true,
        hasGoogle: false,
      },
      user: {
        role: 'visitor',
        authProvider: 'local',
        isProtected: false,
      },
    })
  })

  it('uses the shared credentialed CORS policy for allowed origins', async () => {
    const request = createRequest('http://localhost:3000')

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('vary')).toBe('Origin')
    expect(mocks.checkAccountCheckRateLimit).toHaveBeenCalledWith(
      request,
      'ada@example.com'
    )
    expect(mocks.checkVisitorAccount).toHaveBeenCalledWith('ada@example.com')
  })

  it('does not reflect a fallback origin or credentials for disallowed origins', async () => {
    const response = await POST(createRequest('https://evil.example.com'))

    expect(response.status).toBe(200)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(response.headers.has('access-control-allow-credentials')).toBe(false)
    expect(response.headers.get('vary')).toBe('Origin')
  })

  it('returns 429 before querying account state when the limit is exceeded', async () => {
    mocks.checkAccountCheckRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 42,
    })

    const response = await POST(createRequest('http://localhost:3000'))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
    expect(response.headers.get('vary')).toBe('Origin')
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: 'Too many account checks. Please try again shortly.',
    })
    expect(mocks.checkVisitorAccount).not.toHaveBeenCalled()
  })

  it('does not expose internal rate-limit failures', async () => {
    mocks.checkAccountCheckRateLimit.mockRejectedValue(
      new Error('Redis connection exposed-internal-host:6379 failed')
    )

    const response = await POST(createRequest('http://localhost:3000'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: 'Failed to check user',
    })
    expect(mocks.checkVisitorAccount).not.toHaveBeenCalled()
  })
})
