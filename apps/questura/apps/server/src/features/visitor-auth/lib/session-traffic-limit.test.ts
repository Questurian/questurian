import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const counters = vi.hoisted(() => ({ map: new Map<string, number>(), fail: false }))

vi.mock('@/shared/lib/rate-limit-counter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/rate-limit-counter')>()
  return {
    ...actual,
    getClientIp: (headers: Headers) => headers.get('x-forwarded-for') ?? 'unknown',
    incrementCounter: async (key: string) => {
      if (counters.fail) throw new Error('redis down')
      const count = (counters.map.get(key) ?? 0) + 1
      counters.map.set(key, count)
      return { count, ttlSeconds: 42 }
    },
  }
})

const { checkSessionTrafficLimit } = await import('./session-traffic-limit')
const { visitorSessionToken } = await import('./session-cookie')

beforeEach(() => {
  counters.map.clear()
  counters.fail = false
})
afterEach(() => vi.unstubAllEnvs())

const from = (ip: string) => new Headers({ 'x-forwarded-for': ip })

describe('checkSessionTrafficLimit', () => {
  it('limits one session past its budget, with the bucket’s own retry time', async () => {
    vi.stubEnv('SESSION_TRAFFIC_PER_SESSION', '3')
    for (let i = 0; i < 3; i += 1) expect((await checkSessionTrafficLimit(from('1.1.1.1'), 'tok')).allowed).toBe(true)
    expect(await checkSessionTrafficLimit(from('1.1.1.1'), 'tok')).toEqual({
      allowed: false,
      retryAfterSeconds: 42,
      scope: 'session',
    })
    // Another reader on the same address is not that session.
    expect((await checkSessionTrafficLimit(from('1.1.1.1'), 'other')).allowed).toBe(true)
  })

  // Rotating tokens escapes the per-session bucket by design (an invented
  // token fails Better Auth's signature check before any query), but not the
  // per-address one.
  it('stops token rotation at the address guard', async () => {
    vi.stubEnv('SESSION_TRAFFIC_PER_IP', '5')
    const decisions = []
    for (let i = 0; i < 7; i += 1) decisions.push(await checkSessionTrafficLimit(from('2.2.2.2'), `rotating-${i}`))
    expect(decisions.filter((d) => d.allowed)).toHaveLength(5)
    expect(decisions.at(-1)).toMatchObject({ allowed: false, scope: 'ip' })
    // A different address is unaffected.
    expect((await checkSessionTrafficLimit(from('3.3.3.3'), 'fresh')).allowed).toBe(true)
  })

  // Quantified: the default address guard admits 1,200 session-bearing
  // requests a minute from one address — at three private requests a page,
  // 400 page views a minute from everyone behind one NAT together.
  it('is generous for a shared address by default', async () => {
    const decisions = []
    for (let i = 0; i < 1_200; i += 1) decisions.push(await checkSessionTrafficLimit(from('4.4.4.4'), `reader-${i % 300}`))
    expect(decisions.every((d) => d.allowed)).toBe(true)
    expect((await checkSessionTrafficLimit(from('4.4.4.4'), 'one-more')).allowed).toBe(false)
  })

  it('fails open with a stated reason when the counter is down', async () => {
    counters.fail = true
    expect(await checkSessionTrafficLimit(from('1.1.1.1'), 'tok')).toEqual({
      allowed: true,
      degraded: 'counter-unavailable',
    })
  })

  it('keys on hashes, never the raw token', async () => {
    await checkSessionTrafficLimit(from('1.1.1.1'), 'secret-token-value')
    for (const key of counters.map.keys()) expect(key).not.toContain('secret-token-value')
  })
})

describe('visitorSessionToken', () => {
  it.each([
    ['questura_visitor.session_token=abc', 'abc'],
    ['theme=dark; __Secure-questura_visitor.session_token=xyz', 'xyz'],
    ['questura_visitor.session_data=abc', null],
    ['note=questura_visitor.session_token', null],
    ['questura_visitor.session_token=', null],
    [`questura_visitor.session_token=${'x'.repeat(600)}`, null],
  ])('%s → %s', (cookie, expected) => {
    expect(visitorSessionToken(new Headers({ cookie }))).toBe(expected)
  })
})
