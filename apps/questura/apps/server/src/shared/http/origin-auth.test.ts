import { afterEach, describe, expect, it, vi } from 'vitest'

const compared = vi.hoisted(() => [] as Array<[number, number]>)

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
  const timingSafeEqual = (a: Buffer, b: Buffer) => {
    compared.push([a.length, b.length])
    return actual.timingSafeEqual(a, b)
  }
  return { ...actual, default: { ...actual, timingSafeEqual }, timingSafeEqual }
})

const SECRET = 'origin-secret-for-tests-0123456789abcdef'

describe('origin auth', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('reads the secret and the mode, defaulting to refuse and to refuse on an unknown mode', async () => {
    const { readOriginAuthConfig } = await import('./origin-auth')
    expect(readOriginAuthConfig({})).toEqual({ secret: null, mode: 'refuse' })
    expect(readOriginAuthConfig({ ORIGIN_AUTH_SECRET: '  ' })).toEqual({ secret: null, mode: 'refuse' })
    expect(readOriginAuthConfig({ ORIGIN_AUTH_SECRET: ` ${SECRET} ` })).toEqual({ secret: SECRET, mode: 'refuse' })
    expect(readOriginAuthConfig({ ORIGIN_AUTH_SECRET: SECRET, ORIGIN_AUTH_MODE: 'Unidentified' }).mode).toBe('unidentified')
    expect(readOriginAuthConfig({ ORIGIN_AUTH_SECRET: SECRET, ORIGIN_AUTH_MODE: 'allow' }).mode).toBe('refuse')
  })

  it('gives each request one verdict: missing, wrong, right, exempt, or off', async () => {
    const { originAuthVerdict } = await import('./origin-auth')
    const on = { secret: SECRET, mode: 'refuse' as const }
    const headers = (value?: string) => new Headers(value === undefined ? {} : { 'x-questura-origin-auth': value })

    expect(originAuthVerdict(headers(), '/api/me', on)).toBe('missing')
    expect(originAuthVerdict(headers(''), '/api/me', on)).toBe('missing')
    expect(originAuthVerdict(headers('nope'), '/api/me', on)).toBe('wrong')
    expect(originAuthVerdict(headers(SECRET), '/api/me', on)).toBe('trusted')
    expect(originAuthVerdict(headers(), '/api/health', on)).toBe('exempt')
    expect(originAuthVerdict(headers(), '/api/health/ready', on)).toBe('exempt')
    expect(originAuthVerdict(headers(), '/api/me', { secret: null, mode: 'refuse' })).toBe('off')
  })

  it('compares in constant time: equal-length digests into timingSafeEqual, whatever the input length', async () => {
    compared.length = 0
    const { originSecretMatches } = await import('./origin-auth')

    expect(originSecretMatches('x', SECRET)).toBe(false)
    expect(originSecretMatches(`${SECRET}${'y'.repeat(500)}`, SECRET)).toBe(false)
    expect(originSecretMatches(SECRET, SECRET)).toBe(true)
    // Nothing to compare is not a comparison: no call, no throw.
    expect(originSecretMatches(null, SECRET)).toBe(false)
    expect(originSecretMatches('', SECRET)).toBe(false)

    expect(compared).toEqual([
      [32, 32],
      [32, 32],
      [32, 32],
    ])
  })

  it('names every header an address can be read from, so unidentified really is unidentified', async () => {
    const { CLIENT_ADDRESS_HEADERS } = await import('./origin-auth')
    const { TRUSTED_PROXY_HEADERS } = await import('@/shared/config/trusted-proxy')
    for (const header of [...Object.values(TRUSTED_PROXY_HEADERS), 'x-forwarded-for', 'x-real-ip']) {
      expect(CLIENT_ADDRESS_HEADERS).toContain(header)
    }
  })

  it('leaves getClientIp nothing to read once those headers are gone', async () => {
    vi.stubEnv('TRUSTED_PROXY', 'cloudflare')
    try {
      const { CLIENT_ADDRESS_HEADERS } = await import('./origin-auth')
      const { getClientIp, UNIDENTIFIED_CLIENT } = await import('@/shared/lib/rate-limit-counter')
      const headers = new Headers({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '198.51.100.8', 'x-real-ip': '198.51.100.9' })
      expect(getClientIp(headers)).toBe('198.51.100.7')
      for (const name of CLIENT_ADDRESS_HEADERS) headers.delete(name)
      expect(getClientIp(headers)).toBe(UNIDENTIFIED_CLIENT)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
