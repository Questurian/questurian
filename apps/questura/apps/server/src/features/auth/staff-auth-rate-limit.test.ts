import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  STAFF_FORGOT_PASSWORD_LIMITS,
  STAFF_LOGIN_LIMITS,
  checkStaffAuthRateLimit,
  normalizeStaffEmail,
} from './lib/staff-auth-rate-limit'
import { resetLocalCounters } from '@/shared/lib/rate-limit-counter'

function headers(ip: string): Headers {
  return new Headers({ 'x-forwarded-for': ip })
}

async function attempt(ip: string, email: string | null, scope: 'login' | 'forgot-password' = 'login') {
  return checkStaffAuthRateLimit({
    scope,
    headers: headers(ip),
    email,
    limits: scope === 'login' ? STAFF_LOGIN_LIMITS : STAFF_FORGOT_PASSWORD_LIMITS,
  })
}

describe('staff auth rate limiting', () => {
  beforeEach(() => {
    resetLocalCounters()
  })

  it('limits repeated login attempts against one staff email', async () => {
    for (let i = 0; i < STAFF_LOGIN_LIMITS.perEmail; i += 1) {
      await expect(attempt('192.0.2.1', 'admin@questurian.com')).resolves.toEqual({
        allowed: true,
      })
    }

    const result = await attempt('192.0.2.1', 'admin@questurian.com')

    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('limits one IP spraying many staff emails', async () => {
    for (let i = 0; i < STAFF_LOGIN_LIMITS.perIp; i += 1) {
      await expect(attempt('192.0.2.2', `staff-${i}@questurian.com`)).resolves.toEqual({
        allowed: true,
      })
    }

    const result = await attempt('192.0.2.2', 'staff-final@questurian.com')

    expect(result.allowed).toBe(false)
  })

  it('applies a tighter ceiling to forgot-password', async () => {
    for (let i = 0; i < STAFF_FORGOT_PASSWORD_LIMITS.perEmail; i += 1) {
      await expect(
        attempt('192.0.2.3', 'victim@questurian.com', 'forgot-password')
      ).resolves.toEqual({ allowed: true })
    }

    const result = await attempt('192.0.2.3', 'victim@questurian.com', 'forgot-password')

    expect(result.allowed).toBe(false)
  })

  it('keeps login and forgot-password buckets separate', async () => {
    for (let i = 0; i < STAFF_FORGOT_PASSWORD_LIMITS.perEmail + 1; i += 1) {
      await attempt('192.0.2.4', 'shared@questurian.com', 'forgot-password')
    }

    // Exhausting the reset bucket must not lock the user out of logging in.
    await expect(attempt('192.0.2.4', 'shared@questurian.com', 'login')).resolves.toEqual({
      allowed: true,
    })
  })

  it('does not let one IP consume another IP budget', async () => {
    for (let i = 0; i < STAFF_LOGIN_LIMITS.perIp + 1; i += 1) {
      await attempt('192.0.2.5', `spray-${i}@questurian.com`)
    }

    await expect(attempt('198.51.100.9', 'unrelated@questurian.com')).resolves.toEqual({
      allowed: true,
    })
  })

  it('still counts malformed requests that carry no email', async () => {
    for (let i = 0; i < STAFF_LOGIN_LIMITS.perIp; i += 1) {
      await expect(attempt('192.0.2.6', null)).resolves.toEqual({ allowed: true })
    }

    const result = await attempt('192.0.2.6', null)

    expect(result.allowed).toBe(false)
  })

  it('accommodates the Location Manager service cadence', async () => {
    // PayloadAuthClient caches its token and re-authenticates only near expiry,
    // so a handful of logins per minute is its realistic worst case (several
    // instances restarting at once). That must not be throttled.
    for (let i = 0; i < STAFF_LOGIN_LIMITS.perEmail; i += 1) {
      await expect(attempt('203.0.113.7', 'service@questurian.com')).resolves.toEqual({
        allowed: true,
      })
    }
  })
})

describe('when the shared counter backend is unavailable', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  async function attemptInProductionWithoutRedis(scope: 'login' | 'forgot-password') {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('REDIS_URL', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const module = await import('./lib/staff-auth-rate-limit')

    return module.checkStaffAuthRateLimit({
      scope,
      headers: headers('198.51.100.9'),
      email: 'admin@questurian.com',
      limits: scope === 'login' ? module.STAFF_LOGIN_LIMITS : module.STAFF_FORGOT_PASSWORD_LIMITS,
    })
  }

  // Production without Redis makes the counter throw rather than count in
  // per-process memory. The credential endpoints must read that as a denial:
  // an unthrottled `/api/users/login` is the password oracle this limiter exists
  // to close, so an unusable counter cannot mean "allow".
  it.each(['login', 'forgot-password'] as const)('denies %s rather than allowing it', async (scope) => {
    await expect(attemptInProductionWithoutRedis(scope)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    })
  })

  // The caller renders this denial as an ordinary "Too many attempts" message,
  // which is what an operator — or the Location Manager service identity —
  // would see during a counter outage. Without a log there is no signal at all.
  it('logs the reason rather than passing a counter outage off as a flood', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('REDIS_URL', '')
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    const module = await import('./lib/staff-auth-rate-limit')
    await module.checkStaffAuthRateLimit({
      scope: 'login',
      headers: headers('198.51.100.10'),
      email: 'admin@questurian.com',
      limits: module.STAFF_LOGIN_LIMITS,
    })

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('rate limit unavailable'),
      expect.any(Error)
    )
  })
})

describe('normalizeStaffEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeStaffEmail('  Admin@Questurian.com ')).toBe('admin@questurian.com')
  })

  it.each([[undefined], [null], [''], ['   '], [42]])('returns null for %s', (value) => {
    expect(normalizeStaffEmail(value)).toBeNull()
  })
})
