import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimitMock = vi.hoisted(() => vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })))

vi.mock('./public-read-rate-limit', () => ({
  checkPublicReadRateLimit: rateLimitMock,
  publicReadRateLimitResponse: vi.fn(),
}))

const { admissionGate, resetAdmissionGates } = await import('./admission')
const { admitPublicWork, publicRead } = await import('./public-read')

function request() {
  return new NextRequest('http://localhost/api/public/articles/search?q=lima')
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.stubEnv('PUBLIC_QUERY_CONCURRENCY', '1')
  vi.stubEnv('PUBLIC_QUERY_QUEUE', '1')
  vi.stubEnv('PUBLIC_ASSEMBLY_CONCURRENCY', '1')
  vi.stubEnv('PUBLIC_ASSEMBLY_QUEUE', '1')
  resetAdmissionGates()
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetAdmissionGates()
})

describe('publicRead admission', () => {
  it('refuses work past the query gate with a 503 nothing may cache', async () => {
    const block = deferred()
    const slow = () => block.promise.then(() => NextResponse.json({ ok: true }))

    const running = publicRead({ req: request(), scope: 'search', payload: {} }, slow)
    const queued = publicRead({ req: request(), scope: 'search', payload: {} }, slow)
    const refused = await publicRead({ req: request(), scope: 'search', payload: {} }, slow)

    expect(refused.status).toBe(503)
    expect(refused.headers.get('Cache-Control')).toBe('no-store')
    expect(refused.headers.get('Retry-After')).toBe('1')
    expect(refused.headers.get('X-Questura-Overload')).toBe('query; queue-full')

    block.resolve()
    expect((await running).status).toBe(200)
    expect((await queued).status).toBe(200)
    expect(admissionGate('query').stats().active).toBe(0)
  })

  it('leaves coalesced routes to admit their own shared work', async () => {
    const block = deferred()
    // Occupy the assembly gate and its queue.
    const held = [admitPublicWork('assembly', () => block.promise), admitPublicWork('assembly', () => block.promise)]

    // The wrapper itself does not gate locationHomepage, so a route whose
    // request joins in-flight work is not refused for a slot it never needs.
    const response = await publicRead(
      { req: request(), scope: 'locationHomepage', payload: {} },
      async () => NextResponse.json({ joined: true }),
    )
    expect(response.status).toBe(200)

    // Work that does need a slot is refused as a 503 through the same wrapper.
    const refused = await publicRead({ req: request(), scope: 'locationHomepage', payload: {} }, () =>
      admitPublicWork('assembly', async () => NextResponse.json({})),
    )
    expect(refused.status).toBe(503)

    block.resolve()
    await Promise.all(held)
  })

  // A frozen database used to hang the request; with the pool's client-side
  // limit it throws instead, and that is about right now, not the request.
  it('answers a database that could not answer with a 503 nothing may cache', async () => {
    const response = await publicRead({ req: request(), scope: 'search', payload: {} }, async () => {
      throw new Error('Failed query: select 1', { cause: new Error('Query read timeout') })
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Questura-Unavailable')).toBe('database')
    expect(admissionGate('query').stats().active).toBe(0)
  })

  it('still lets real errors through as errors', async () => {
    await expect(
      publicRead({ req: request(), scope: 'search', payload: {} }, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(admissionGate('query').stats().active).toBe(0)
  })
})

/**
 * L07: the ingress stage, and why it sits before the rate limiter.
 *
 * The limiter is a Redis call. It fails open when Redis is unavailable, which
 * is right — but "fails open" describes the answer, not the wait. A half-open
 * Redis answers slowly rather than not at all, so every arriving request sits
 * in the limiter until its command deadline, and nothing bounded how many
 * requests could be sitting there at once. A deadline caps one command; it
 * says nothing about how many requests are holding one.
 */
describe('the ingress stage', () => {
  beforeEach(() => {
    rateLimitMock.mockReset()
    rateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    resetAdmissionGates()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    resetAdmissionGates()
  })

  it('bounds requests waiting on a slow rate limiter', async () => {
    vi.stubEnv('PUBLIC_INGRESS_CONCURRENCY', '1')
    vi.stubEnv('PUBLIC_INGRESS_QUEUE', '0')
    resetAdmissionGates()

    let releaseRedis!: () => void
    const redisIsSlow = new Promise<void>((resolve) => {
      releaseRedis = resolve
    })
    rateLimitMock.mockImplementation(async () => {
      await redisIsSlow
      return { allowed: true, retryAfterSeconds: 0 }
    })

    const first = publicRead(
      { req: { headers: new Headers() }, scope: 'navigation', payload: {} },
      async () => NextResponse.json({ ok: true }),
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

    const second = await publicRead(
      { req: { headers: new Headers() }, scope: 'navigation', payload: {} },
      async () => NextResponse.json({ ok: true }),
    )

    // Refused while the first is still inside the limiter — which is the
    // whole point: something has to be able to say no while the dependency
    // behind it is still deciding.
    expect(second.status).toBe(503)
    expect(second.headers.get('Cache-Control')).toBe('no-store')

    releaseRedis()
    expect((await first).status).toBe(200)
  })

  // `navigation` is a handful of depth-0 reads and deliberately has no
  // assembly or query gate. It still has to be bounded as a *request*.
  it('covers navigation, which has no work gate of its own', async () => {
    vi.stubEnv('PUBLIC_INGRESS_CONCURRENCY', '1')
    vi.stubEnv('PUBLIC_INGRESS_QUEUE', '0')
    resetAdmissionGates()

    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    const first = publicRead({ req: { headers: new Headers() }, scope: 'navigation', payload: {} }, async () => {
      await held
      return NextResponse.json({ ok: true })
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    const second = await publicRead(
      { req: { headers: new Headers() }, scope: 'navigation', payload: {} },
      async () => NextResponse.json({ ok: true }),
    )

    expect(second.status).toBe(503)
    release()
    await first
  })

  it('does not refuse anything while it has room', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        publicRead({ req: { headers: new Headers() }, scope: 'navigation', payload: {} }, async () =>
          NextResponse.json({ ok: true }),
        ),
      ),
    )

    expect(responses.every((response) => response.status === 200)).toBe(true)
  })
})
