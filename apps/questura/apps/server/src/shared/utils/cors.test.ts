import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    CORS_ORIGINS: ['http://localhost:3000', 'https://app.example.com'],
  },
}))

import {
  forbiddenOriginResponse,
  getCorsHeaders,
  getPrivateCorsHeaders,
  isForbiddenOrigin,
} from './cors'

function requestWithOrigin(origin?: string) {
  return new NextRequest('http://localhost:4000/api/health', {
    headers: origin ? { origin } : {},
  })
}

describe('getCorsHeaders', () => {
  it('reflects an allowed origin with credentials', () => {
    const headers = getCorsHeaders(requestWithOrigin('https://app.example.com'))

    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com')
    expect(headers['Access-Control-Allow-Credentials']).toBe('true')
    expect(headers['Vary']).toBe('Origin')
  })

  it('omits Access-Control-Allow-Origin for disallowed origins', () => {
    const headers = getCorsHeaders(requestWithOrigin('https://evil.example.com'))

    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin')
    expect(headers).not.toHaveProperty('Access-Control-Allow-Credentials')
  })

  it('omits Access-Control-Allow-Origin when no origin header is present', () => {
    const headers = getCorsHeaders(requestWithOrigin())

    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin')
    expect(headers).not.toHaveProperty('Access-Control-Allow-Credentials')
  })
})

describe('getPrivateCorsHeaders', () => {
  it('forbids storing a per-caller response', () => {
    const headers = getPrivateCorsHeaders(requestWithOrigin('https://app.example.com'))

    expect(headers['Cache-Control']).toBe('no-store, no-cache, must-revalidate')
  })

  // `private` would be honoured by the browser and ignored by exactly the
  // shared cache this is defending against.
  it('never downgrades to a directive a shared cache may store', () => {
    const headers = getPrivateCorsHeaders(requestWithOrigin('https://app.example.com'))

    expect(headers['Cache-Control']).not.toMatch(/(^|[\s,])(private|public|max-age)/)
  })

  it('varies by cookie as well as origin, so a stored copy is keyed by session', () => {
    const headers = getPrivateCorsHeaders(requestWithOrigin('https://app.example.com'))

    expect(headers['Vary']).toBe('Origin, Cookie')
  })

  it('keeps the CORS contract of the headers it wraps', () => {
    const allowed = getPrivateCorsHeaders(requestWithOrigin('https://app.example.com'))
    const disallowed = getPrivateCorsHeaders(requestWithOrigin('https://evil.example.com'))

    expect(allowed['Access-Control-Allow-Origin']).toBe('https://app.example.com')
    expect(allowed['Access-Control-Allow-Credentials']).toBe('true')
    expect(disallowed).not.toHaveProperty('Access-Control-Allow-Origin')
    expect(disallowed['Cache-Control']).toBe('no-store, no-cache, must-revalidate')
  })
})

function request({ origin, cookie }: { origin?: string; cookie?: string } = {}) {
  const headers = new Headers()
  if (origin) headers.set('origin', origin)
  if (cookie) headers.set('cookie', cookie)
  return { headers } as NextRequest
}

describe('isForbiddenOrigin', () => {
  it('rejects an origin that is not this deployment', () => {
    expect(isForbiddenOrigin(request({ origin: 'https://evil.example' }))).toBe(true)
  })

  it('rejects the literal null origin a sandboxed iframe sends', () => {
    expect(isForbiddenOrigin(request({ origin: 'null' }))).toBe(true)
  })

  it('rejects a cookie-bearing request with no Origin', () => {
    expect(isForbiddenOrigin(request({ cookie: 'questura_visitor.session_token=abc' }))).toBe(true)
  })

  it('allows a cookieless request with no Origin', () => {
    expect(isForbiddenOrigin(request())).toBe(false)
  })

  it('allows an allowlisted origin', () => {
    expect(isForbiddenOrigin(request({ origin: 'http://localhost:3000', cookie: 'sid=1' }))).toBe(
      false
    )
  })
})

describe('forbiddenOriginResponse', () => {
  it('returns 403 for a forbidden origin and null otherwise', async () => {
    const blocked = forbiddenOriginResponse(request({ origin: 'https://evil.example' }), {})
    expect(blocked?.status).toBe(403)
    await expect(blocked?.json()).resolves.toEqual({ error: 'Origin not allowed.' })

    expect(forbiddenOriginResponse(request({ origin: 'http://localhost:3000' }), {})).toBeNull()
  })
})
