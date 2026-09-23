import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextRequest } from 'next/server'

import { resetLocalCounters } from '@/shared/lib/rate-limit-counter'

/**
 * `better-auth.ts` opens a pg pool at import, so the session and accounts
 * lookups are stubbed. What is under test is the route: the origin guard, the
 * 401s, and that it answers with the methods and nothing cacheable.
 */
const getSession = vi.fn()
const findAccounts = vi.fn()

vi.mock('@/features/visitor-auth/lib/better-auth', () => ({
  visitorAuth: {
    api: {
      get getSession() {
        return getSession
      },
    },
    $context: Promise.resolve({ internalAdapter: { findAccounts: (id: string) => findAccounts(id) } }),
  },
}))

vi.mock('@/features/visitor-auth/lib/visitor-profile', () => ({
  findVisitorProfileByAuthUserId: vi.fn(),
  ensureVisitorProfileForAuthUser: vi.fn(),
}))

const { GET } = await import('./route')

const ALLOWED_ORIGIN = 'http://localhost:3000'
const SESSION_COOKIE = 'questura_visitor.session_token=x.y'

function request({ origin, cookie }: { origin?: string; cookie?: string } = {}): NextRequest {
  const headers = new Headers({ 'x-forwarded-for': '192.0.2.10' })
  if (origin) headers.set('origin', origin)
  if (cookie) headers.set('cookie', cookie)
  return { headers, signal: undefined } as unknown as NextRequest
}

describe('GET /api/account/auth-methods', () => {
  beforeEach(() => {
    resetLocalCounters()
    getSession.mockReset()
    findAccounts.mockReset()
  })

  it('refuses a foreign origin before any lookup', async () => {
    const response = await GET(request({ origin: 'https://evil.example', cookie: SESSION_COOKIE }))

    expect(response.status).toBe(403)
    expect(getSession).not.toHaveBeenCalled()
  })

  it('answers 401 without a lookup when there is no session cookie', async () => {
    const response = await GET(request({ origin: ALLOWED_ORIGIN }))

    expect(response.status).toBe(401)
    expect(getSession).not.toHaveBeenCalled()
  })

  it('answers 401 when the cookie names no live session', async () => {
    getSession.mockResolvedValue(null)

    const response = await GET(request({ origin: ALLOWED_ORIGIN, cookie: SESSION_COOKIE }))

    expect(response.status).toBe(401)
    expect(findAccounts).not.toHaveBeenCalled()
  })

  it('returns the sign-in methods for the session user, uncached', async () => {
    getSession.mockResolvedValue({ user: { id: 'visitor_1', email: 'v@example.com' } })
    findAccounts.mockResolvedValue([{ providerId: 'credential' }, { providerId: 'google' }])

    const response = await GET(request({ origin: ALLOWED_ORIGIN, cookie: SESSION_COOKIE }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ hasLocalPassword: true, hasGoogleOAuth: true, authProvider: 'dual' })
    expect(findAccounts).toHaveBeenCalledWith('visitor_1')
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(response.headers.get('Cache-Control')).toMatch(/no-store/)
  })
})
