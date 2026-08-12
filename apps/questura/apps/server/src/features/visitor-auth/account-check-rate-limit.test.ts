import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkAccountCheckRateLimit } from './lib/account-check-rate-limit'

function createRequest(ip: string) {
  return new Request('http://localhost:4000/api/user/check', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  }) as any
}

describe('account-check rate limiting', () => {
  it('limits repeated checks for the same normalized email', async () => {
    const request = createRequest('192.0.2.10')

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        checkAccountCheckRateLimit(request, 'email-limit@example.com')
      ).resolves.toEqual({ allowed: true })
    }

    const result = await checkAccountCheckRateLimit(request, 'email-limit@example.com')

    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0)
    }
  })

  it('limits an IP that rotates through email addresses', async () => {
    const request = createRequest('192.0.2.20')

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        checkAccountCheckRateLimit(request, `rotated-${attempt}@example.com`)
      ).resolves.toEqual({ allowed: true })
    }

    const result = await checkAccountCheckRateLimit(request, 'rotated-final@example.com')

    expect(result.allowed).toBe(false)
  })
})

describe('when the shared counter backend is unavailable', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  // This route answers "does an account exist for this email?" — exactly the
  // question the limiter bounds. An unusable counter must deny, not allow.
  it('denies the check rather than allowing unbounded enumeration', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('REDIS_URL', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const module = await import('./lib/account-check-rate-limit')

    await expect(
      module.checkAccountCheckRateLimit(createRequest('198.51.100.20'), 'visitor@example.com')
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 })
  })

  it('logs the reason, so a denial is distinguishable from a real flood', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('REDIS_URL', '')
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    const module = await import('./lib/account-check-rate-limit')
    await module.checkAccountCheckRateLimit(createRequest('198.51.100.21'), 'visitor@example.com')

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('rate limit'),
      expect.any(Error)
    )
  })
})
