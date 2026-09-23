import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Launch harness B3: a caller who rotates spoofed address headers must not
 * rotate their rate-limit bucket, under every `TRUSTED_PROXY` value.
 *
 * Driven through a real limiter (`checkPaymentsRateLimit`, scope `plans`,
 * 30 a minute per address) rather than through `getClientIp` alone, so the
 * property under test is the one an attacker cares about: does request 31
 * get refused?
 *
 * What this cannot prove: that the trusted header itself is unforgeable. It
 * is only as honest as the proxy that overwrites it, and a caller who reaches
 * the origin directly can write it (the last test below says so out loud).
 * That is launch check C2 — the origin must be unreachable — not a unit test.
 */

vi.mock('@/features/visitor-auth/lib/redis-secondary-storage', () => ({
  redisSecondaryStorage: {
    async incrementWithExpiry() {
      throw new Error('unused: REDIS_URL is empty, counters are in memory')
    },
  },
}))

const PROXIES = {
  cloudflare: 'cf-connecting-ip',
  vercel: 'x-vercel-forwarded-for',
  netlify: 'x-nf-client-connection-ip',
  fly: 'fly-client-ip',
} as const

/** Every header some stack reads a client address from. */
const ADDRESS_HEADERS = [
  'x-forwarded-for',
  'x-real-ip',
  'forwarded',
  'true-client-ip',
  'x-client-ip',
  'x-cluster-client-ip',
  ...Object.values(PROXIES),
] as const

const PLANS_LIMIT = 30

type Limiter = typeof import('@/features/payments/lib/payments-rate-limit')

async function loadLimiter(trustedProxy: string | undefined): Promise<Limiter> {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('REDIS_URL', '')
  vi.stubEnv('TRUSTED_PROXY', trustedProxy ?? '')
  return import('@/features/payments/lib/payments-rate-limit')
}

/** Sends `PLANS_LIMIT + 1` requests and returns the verdict on the last. */
async function lastVerdict(limiter: Limiter, headersFor: (attempt: number) => Headers) {
  let verdict
  for (let attempt = 0; attempt <= PLANS_LIMIT; attempt += 1) {
    verdict = await limiter.checkPaymentsRateLimit(headersFor(attempt), 'plans')
  }
  return verdict
}

const forgedIPv4 = (attempt: number) => `203.0.113.${attempt % 250}`

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe.each(Object.entries(PROXIES))('TRUSTED_PROXY=%s', (name, trusted) => {
  const others = ADDRESS_HEADERS.filter((header) => header !== trusted)

  it.each(others)('rotating a forged %s does not rotate the bucket', async (forged) => {
    const limiter = await loadLimiter(name)

    const verdict = await lastVerdict(
      limiter,
      (attempt) => new Headers({ [trusted]: '192.0.2.1', [forged]: forgedIPv4(attempt) })
    )

    expect(verdict).toMatchObject({ allowed: false })
  })

  it('rotating every other header at once does not rotate the bucket', async () => {
    const limiter = await loadLimiter(name)

    const verdict = await lastVerdict(limiter, (attempt) => {
      const headers = new Headers({ [trusted]: '192.0.2.2' })
      for (const header of others) headers.set(header, forgedIPv4(attempt))
      return headers
    })

    expect(verdict).toMatchObject({ allowed: false })
  })

  // No trusted header: the request did not come through the proxy. All such
  // callers share one bucket instead of each forged header being a new one.
  it('with the trusted header missing, forged headers share one bucket', async () => {
    const limiter = await loadLimiter(name)

    const verdict = await lastVerdict(limiter, (attempt) => {
      const headers = new Headers()
      for (const header of others) headers.set(header, forgedIPv4(attempt))
      return headers
    })

    expect(verdict).toMatchObject({ allowed: false })
  })

  // A proxy that overwrites its header never writes garbage there, so only a
  // caller at the origin can. Each distinct string used to be its own bucket.
  it('rotating garbage in the trusted header does not rotate the bucket', async () => {
    const limiter = await loadLimiter(name)

    const verdict = await lastVerdict(
      limiter,
      (attempt) => new Headers({ [trusted]: `not-an-ip-${attempt}` })
    )

    expect(verdict).toMatchObject({ allowed: false })
  })

  it('a comma list in the trusted header does not rotate the bucket', async () => {
    const limiter = await loadLimiter(name)

    const verdict = await lastVerdict(
      limiter,
      (attempt) => new Headers({ [trusted]: `${forgedIPv4(attempt)}, 192.0.2.3` })
    )

    expect(verdict).toMatchObject({ allowed: false })
  })

  // Real addresses, honestly delivered by the proxy: one IPv6 /64 is one
  // caller, however many addresses in it they use.
  it('rotating addresses inside one IPv6 /64 does not rotate the bucket', async () => {
    const limiter = await loadLimiter(name)

    const verdict = await lastVerdict(
      limiter,
      (attempt) => new Headers({ [trusted]: `2001:db8:77:1::${attempt.toString(16)}` })
    )

    expect(verdict).toMatchObject({ allowed: false })
  })

  it('one IPv4 caller seen as IPv4-mapped IPv6 shares its bucket', async () => {
    const limiter = await loadLimiter(name)

    const verdict = await lastVerdict(
      limiter,
      (attempt) =>
        new Headers({ [trusted]: attempt % 2 ? '192.0.2.4' : '::ffff:192.0.2.4' })
    )

    expect(verdict).toMatchObject({ allowed: false })
  })

  // The remaining assumption, stated as a test so nobody reads the suite above
  // as proving more than it does. Reachable origin = unlimited buckets.
  it('does rotate on distinct valid addresses in the trusted header (origin must be unreachable)', async () => {
    const limiter = await loadLimiter(name)

    const verdict = await lastVerdict(
      limiter,
      (attempt) => new Headers({ [trusted]: forgedIPv4(attempt) })
    )

    expect(verdict).toEqual({ allowed: true })
  })
})

// Development only: nothing fronts the app, so there is nothing to spoof past.
// Production refuses to boot here (`assert-production-config.test.ts`).
describe('TRUSTED_PROXY unset (development)', () => {
  it('reads x-forwarded-for, and rotating it rotates the bucket', async () => {
    const limiter = await loadLimiter(undefined)

    const verdict = await lastVerdict(
      limiter,
      (attempt) => new Headers({ 'x-forwarded-for': forgedIPv4(attempt) })
    )

    expect(verdict).toEqual({ allowed: true })
  })

  it('still counts IPv6 per /64 and refuses garbage', async () => {
    const limiter = await loadLimiter(undefined)

    const ipv6 = await lastVerdict(
      limiter,
      (attempt) => new Headers({ 'x-forwarded-for': `2001:db8:99:1::${attempt.toString(16)}` })
    )
    expect(ipv6).toMatchObject({ allowed: false })

    const garbage = await lastVerdict(
      limiter,
      (attempt) => new Headers({ 'x-forwarded-for': `junk-${attempt}` })
    )
    expect(garbage).toMatchObject({ allowed: false })
  })
})
