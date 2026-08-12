import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

import { resetLocalCounters } from '@/shared/lib/rate-limit-counter'

/**
 * `better-auth.ts` opens a pg pool at import, so the adapter under test is
 * exercised against a stub. The point of these cases is what the *route* does
 * before and around the delegation, since delegating is all it used to do.
 */
const setPassword = vi.fn(async () => ({ status: true }))

vi.mock('@/features/visitor-auth/lib/better-auth', () => ({
  visitorAuth: {
    api: {
      get setPassword() {
        return setPassword
      },
    },
  },
}))

const { POST } = await import('./route')

// Outside production `CORS_ORIGINS` carries the localhost dev origins.
const ALLOWED_ORIGIN = 'http://localhost:3000'

function request({
  body = { newPassword: 'Str0ng!Passw0rd' },
  origin,
  cookie,
  ip = '192.0.2.1',
}: {
  body?: unknown
  origin?: string
  cookie?: string
  ip?: string
} = {}): NextRequest {
  const headers = new Headers({ 'x-forwarded-for': ip })
  if (origin) headers.set('origin', origin)
  if (cookie) headers.set('cookie', cookie)

  return {
    headers,
    json: async () => body,
  } as unknown as NextRequest
}

describe('POST /api/account/set-password', () => {
  beforeEach(() => {
    resetLocalCounters()
    setPassword.mockClear()
  })

  describe('password strength', () => {
    // Better Auth's `setPassword` is a *pathless* endpoint, so `ctx.path` is
    // undefined in the `hooks.before` middleware and the `/set-password` entry
    // in PASSWORD_BEARING_PATHS never matched. Better Auth itself only checks
    // length, so these passwords were all accepted through this route while
    // being rejected on every other path.
    it.each([
      ['no uppercase, number or symbol', 'passwordd'],
      ['no symbol', 'Password1'],
      ['no number', 'Password!'],
      ['no uppercase', 'password1!'],
      ['too short', 'Pa1!'],
    ])('rejects a password with %s', async (_label, newPassword) => {
      const response = await POST(request({ body: { newPassword }, origin: ALLOWED_ORIGIN }))

      expect(response.status).toBe(400)
      expect(setPassword).not.toHaveBeenCalled()
    })

    it('accepts a password meeting the shared rule', async () => {
      const response = await POST(request({ origin: ALLOWED_ORIGIN }))

      expect(response.status).toBe(200)
      expect(setPassword).toHaveBeenCalledOnce()
    })

    it('still rejects a non-string body value', async () => {
      const response = await POST(request({ body: { newPassword: 12345678 } }))

      expect(response.status).toBe(400)
      expect(setPassword).not.toHaveBeenCalled()
    })
  })

  describe('origin', () => {
    it('rejects an origin that is not this deployment', async () => {
      const response = await POST(request({ origin: 'https://evil.example' }))

      expect(response.status).toBe(403)
      expect(setPassword).not.toHaveBeenCalled()
    })

    it('rejects the literal "null" origin a sandboxed iframe sends', async () => {
      const response = await POST(request({ origin: 'null' }))

      expect(response.status).toBe(403)
      expect(setPassword).not.toHaveBeenCalled()
    })

    // Better Auth's own `validateOrigin` forbids a missing Origin whenever a
    // Cookie is present; a browser always sends one on a POST, so an absent
    // Origin alongside a session cookie is not a shape to trust.
    it('rejects a cookie-bearing request with no Origin at all', async () => {
      const response = await POST(request({ cookie: 'questura_visitor.session_token=abc' }))

      expect(response.status).toBe(403)
      expect(setPassword).not.toHaveBeenCalled()
    })

    it('allows a cookieless request with no Origin, which no browser produces', async () => {
      const response = await POST(request())

      expect(response.status).toBe(200)
    })
  })

  describe('throttling', () => {
    // Better Auth's own limiter runs in `router()`'s onRequest, which a direct
    // `visitorAuth.api` call never reaches.
    it('limits repeated attempts from one IP', async () => {
      for (let i = 0; i < 5; i += 1) {
        const allowed = await POST(request({ ip: '192.0.2.50' }))
        expect(allowed.status).toBe(200)
      }

      const response = await POST(request({ ip: '192.0.2.50' }))

      expect(response.status).toBe(429)
      expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    })

    it('throttles before parsing the body, so a malformed flood still counts', async () => {
      for (let i = 0; i < 5; i += 1) {
        await POST(request({ body: { newPassword: 'weak' }, ip: '192.0.2.51' }))
      }

      const response = await POST(request({ ip: '192.0.2.51' }))

      expect(response.status).toBe(429)
    })

    it('does not let one IP consume another IP budget', async () => {
      for (let i = 0; i < 6; i += 1) {
        await POST(request({ ip: '192.0.2.52' }))
      }

      await expect(POST(request({ ip: '198.51.100.4' }))).resolves.toMatchObject({ status: 200 })
    })
  })

  describe('delegation', () => {
    it('passes the caller headers through so Better Auth resolves the session', async () => {
      await POST(request({ origin: ALLOWED_ORIGIN }))

      expect(setPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { newPassword: 'Str0ng!Passw0rd' },
          headers: expect.any(Headers),
        })
      )
    })

    it('surfaces a Better Auth rejection with its own status', async () => {
      const { APIError } = await import('better-auth/api')
      setPassword.mockRejectedValueOnce(
        new APIError('BAD_REQUEST', { message: 'user already has a password' })
      )

      const response = await POST(request())

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: 'user already has a password' })
    })
  })
})
