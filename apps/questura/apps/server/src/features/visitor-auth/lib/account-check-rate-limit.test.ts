import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

import { checkAccountCheckRateLimit } from './account-check-rate-limit'
import { resetLocalCounters } from '@/shared/lib/rate-limit-counter'

function request(ip: string): NextRequest {
  return { headers: new Headers({ 'x-forwarded-for': ip }) } as NextRequest
}

describe('account check rate limiting', () => {
  beforeEach(() => {
    resetLocalCounters()
  })

  it('allows a normal sign-up flow probing one email', async () => {
    await expect(
      checkAccountCheckRateLimit(request('192.0.2.10'), 'visitor@example.com')
    ).resolves.toEqual({ allowed: true })
  })

  it('limits enumeration of one email', async () => {
    for (let i = 0; i < 5; i += 1) {
      await checkAccountCheckRateLimit(request('192.0.2.11'), 'victim@example.com')
    }

    await expect(
      checkAccountCheckRateLimit(request('192.0.2.11'), 'victim@example.com')
    ).resolves.toMatchObject({ allowed: false })
  })

  it('limits one IP sweeping many emails', async () => {
    for (let i = 0; i < 10; i += 1) {
      await checkAccountCheckRateLimit(request('192.0.2.12'), `victim${i}@example.com`)
    }

    await expect(
      checkAccountCheckRateLimit(request('192.0.2.12'), 'victim-last@example.com')
    ).resolves.toMatchObject({ allowed: false })
  })
})

describe('when the shared counter backend is unavailable', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // This route answers "does an account exist for this email?" — exactly the
  // question the limiter bounds. An unusable counter must deny, not allow.
  it('denies the check rather than allowing unbounded enumeration', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('REDIS_URL', '')

    const module = await import('./account-check-rate-limit')

    await expect(
      module.checkAccountCheckRateLimit(request('198.51.100.20'), 'visitor@example.com')
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 })
  })
})
