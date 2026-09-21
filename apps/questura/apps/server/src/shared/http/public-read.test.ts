import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./public-read-rate-limit', () => ({
  checkPublicReadRateLimit: vi.fn(async () => ({ allowed: true })),
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

  it('still lets real errors through as errors', async () => {
    await expect(
      publicRead({ req: request(), scope: 'search', payload: {} }, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(admissionGate('query').stats().active).toBe(0)
  })
})
