import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { proxy } from './proxy'

/**
 * The request id goes in (forwarded to the route, where the logger and the
 * error reporter read it) and out (on the response). NextResponse.next()
 * carries forwarded request headers as `x-middleware-request-*`.
 */

function run(headers: Record<string, string> = {}) {
  const response = proxy(new NextRequest('http://localhost:4000/api/me', { headers }))
  return {
    echoed: response.headers.get('x-request-id'),
    forwarded: response.headers.get('x-middleware-request-x-request-id'),
    overridden: response.headers.get('x-middleware-override-headers') ?? '',
  }
}

describe('proxy request id', () => {
  it("keeps a well-formed id from the caller, forwards it and echoes it", () => {
    const { echoed, forwarded, overridden } = run({ 'x-request-id': '8b3c1f2a9d0e1f23-LHR' })
    expect(echoed).toBe('8b3c1f2a9d0e1f23-LHR')
    expect(forwarded).toBe('8b3c1f2a9d0e1f23-LHR')
    expect(overridden.split(',')).toContain('x-request-id')
  })

  it('makes a new id when there is none', () => {
    const { echoed, forwarded } = run()
    expect(echoed).toMatch(/^[0-9a-f-]{36}$/)
    expect(forwarded).toBe(echoed)
  })

  it('replaces a malformed id rather than logging it', () => {
    const { echoed } = run({ 'x-request-id': 'no good' })
    expect(echoed).not.toBe('no good')
    expect(echoed).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('keeps the rest of the request headers', () => {
    const response = proxy(
      new NextRequest('http://localhost:4000/api/me', { headers: { cookie: 'a=b', origin: 'http://localhost:3000' } }),
    )
    expect(response.headers.get('x-middleware-request-cookie')).toBe('a=b')
    expect(response.headers.get('x-middleware-request-origin')).toBe('http://localhost:3000')
  })
})

/**
 * The front door (ADR-0016, launch fix plan item 10). `ORIGIN_AUTH_SECRET` is
 * read per request, so each case sets it with `vi.stubEnv`.
 */
describe('proxy origin lock', () => {
  const SECRET = 'origin-secret-for-tests-0123456789abcdef'

  function call(path: string, headers: Record<string, string> = {}, method = 'GET') {
    return proxy(new NextRequest(`http://localhost:4000${path}`, { headers, method }))
  }

  const forwarded = (response: Response) => (response.headers.get('x-middleware-override-headers') ?? '').split(',')

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is off without a secret: nothing refused, and a stray header is still removed', () => {
    const response = call('/api/me', { 'x-questura-origin-auth': 'anything', 'cf-connecting-ip': '198.51.100.7' })
    expect(response.status).toBe(200)
    expect(forwarded(response)).not.toContain('x-questura-origin-auth')
    expect(response.headers.get('x-middleware-request-x-questura-origin-auth')).toBeNull()
    expect(response.headers.get('x-middleware-request-cf-connecting-ip')).toBe('198.51.100.7')
  })

  describe('refuse (the default)', () => {
    beforeEach(() => {
      vi.stubEnv('ORIGIN_AUTH_SECRET', SECRET)
    })

    it('refuses a request with no header: 403, no-store, with a request id and nothing else to go on', async () => {
      const response = call('/api/me', { 'cf-connecting-ip': '198.51.100.7' })
      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
      expect(response.headers.get('x-middleware-next')).toBeNull()
      expect(await response.json()).toEqual({ error: 'Forbidden' })
    })

    it('refuses a wrong header, whether shorter, longer, or the right length', () => {
      for (const wrong of ['x', SECRET.slice(0, -1), `${SECRET}x`, SECRET.replace(/.$/, 'X'), SECRET.toUpperCase()]) {
        expect(call('/api/me', { 'x-questura-origin-auth': wrong }).status).toBe(403)
      }
    })

    it('refuses every method and every route, webhooks and the admin panel included', () => {
      for (const [path, method] of [
        ['/api/payments/webhooks/stripe', 'POST'],
        ['/api/visitor-auth/callback/google', 'GET'],
        ['/admin', 'GET'],
        ['/api/graphql', 'POST'],
        ['/api/payments/create-checkout-session', 'OPTIONS'],
        ['/', 'GET'],
      ] as const) {
        expect(call(path, {}, method).status, `${method} ${path}`).toBe(403)
      }
    })

    it('serves the right header and removes it before the route sees it', () => {
      const response = call('/api/me', { 'x-questura-origin-auth': SECRET, 'cf-connecting-ip': '198.51.100.7' })
      expect(response.status).toBe(200)
      expect(response.headers.get('x-middleware-next')).toBe('1')
      expect(forwarded(response)).not.toContain('x-questura-origin-auth')
      expect(response.headers.get('x-middleware-request-x-questura-origin-auth')).toBeNull()
      // The address Cloudflare wrote is kept: this caller came through it.
      expect(response.headers.get('x-middleware-request-cf-connecting-ip')).toBe('198.51.100.7')
    })

    it('accepts surrounding whitespace on the header, as a copied secret often has', () => {
      expect(call('/api/me', { 'x-questura-origin-auth': ` ${SECRET} ` }).status).toBe(200)
    })

    it('answers both health paths without the header (Railway calls ready on the container)', () => {
      expect(call('/api/health').status).toBe(200)
      expect(call('/api/health/ready').status).toBe(200)
    })

    it('exempts those two exact paths only, not their neighbours', () => {
      for (const path of ['/api/health/readyx', '/api/healthz', '/api/health/ready/extra', '/api/health-check']) {
        expect(call(path).status, path).toBe(403)
      }
      // The URL is normalised before the check: dot segments cannot borrow the exemption.
      expect(call('/api/health/ready/../../me').status).toBe(403)
    })
  })

  describe('unidentified', () => {
    beforeEach(() => {
      vi.stubEnv('ORIGIN_AUTH_SECRET', SECRET)
      vi.stubEnv('ORIGIN_AUTH_MODE', 'unidentified')
    })

    it('serves a request without the header, with every address header removed', () => {
      const response = call('/api/me', {
        'cf-connecting-ip': '198.51.100.7',
        'x-forwarded-for': '198.51.100.8',
        'x-real-ip': '198.51.100.9',
        'fly-client-ip': '198.51.100.10',
        cookie: 'a=b',
      })
      expect(response.status).toBe(200)
      const kept = forwarded(response)
      for (const name of ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'fly-client-ip']) {
        expect(kept, name).not.toContain(name)
        expect(response.headers.get(`x-middleware-request-${name}`)).toBeNull()
      }
      expect(response.headers.get('x-middleware-request-cookie')).toBe('a=b')
    })

    it('treats a wrong header the same way, and removes it', () => {
      const response = call('/api/me', { 'x-questura-origin-auth': 'wrong', 'cf-connecting-ip': '198.51.100.7' })
      expect(response.status).toBe(200)
      expect(forwarded(response)).not.toContain('cf-connecting-ip')
      expect(forwarded(response)).not.toContain('x-questura-origin-auth')
    })

    it('keeps the address of a request with the right header', () => {
      const response = call('/api/me', { 'x-questura-origin-auth': SECRET, 'cf-connecting-ip': '198.51.100.7' })
      expect(response.headers.get('x-middleware-request-cf-connecting-ip')).toBe('198.51.100.7')
      expect(forwarded(response)).not.toContain('x-questura-origin-auth')
    })
  })
})
