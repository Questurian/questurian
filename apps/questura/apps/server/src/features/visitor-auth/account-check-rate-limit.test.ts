import { describe, expect, it } from 'vitest'

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
