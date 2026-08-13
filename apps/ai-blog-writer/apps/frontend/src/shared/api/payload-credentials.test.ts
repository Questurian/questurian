import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { payloadRequest, payloadMutation } from './client/http'
import { fetchStaffUsers, uploadAvatarAsset } from '../../features/staff/api/staff.api'
import { fetchMediaSetOptions } from '../../features/locationDocuments/api'
import { fetchListicles } from '../../features/singleTypeListicles/api'
import { payloadRequest as itineraryPayloadRequest } from '../../features/listicleItineraries/api/payloadClient'
import { getArticleLocationScope } from '../locationScope/scope'

/**
 * Every authenticated call to Payload sends the session cookie, and nothing
 * else.
 *
 * These clients grew independently and disagreed about `credentials`; that was
 * unified first, while each one still carried an `Authorization: Bearer`
 * header. The header is now gone, which is what makes the cookie the actual
 * credential rather than a redundant second one.
 *
 * Both halves are asserted per client, because dropping the header is only
 * safe where the cookie is genuinely being sent. A client that lost the header
 * but kept `credentials: 'same-origin'` would authenticate as nobody.
 *
 * Sending both would be worse than redundant. Payload's `extractJWT` returns
 * the *first* credential it finds in `jwtOrder` (`JWT`, `Bearer`, `cookie`)
 * and `JWTAuthentication` verifies only that one — so a stale header shadows a
 * valid cookie and fails the request outright rather than falling through.
 * That is not hypothetical: it is exactly the bug `logoutPayloadUser` already
 * had to work around, and the one `requestSession` had until this change.
 *
 * Every Payload client in the app is listed below, so the set is checkable by
 * reading rather than by remembering.
 */

const fetchMock = vi.fn()

function jsonResponse(body: unknown = { docs: [] }): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

function lastInit(): RequestInit | undefined {
  const calls = fetchMock.mock.calls
  return calls[calls.length - 1]?.[1] as RequestInit | undefined
}

function lastCredentials(): RequestCredentials | undefined {
  return lastInit()?.credentials
}

function lastAuthorization(): string | null {
  return new Headers(lastInit()?.headers).get('Authorization')
}

/** The cookie is sent, and no header is there to shadow it. */
function expectCookieIsTheOnlyCredential(): void {
  expect(lastCredentials()).toBe('include')
  expect(lastAuthorization()).toBeNull()
}

describe('Payload clients send the session cookie', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(jsonResponse())
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shared payloadRequest', async () => {
    await payloadRequest('/api/articles')

    expectCookieIsTheOnlyCredential()
  })

  it('shared payloadMutation', async () => {
    await payloadMutation('/api/articles/1', 'PATCH', { title: 'x' })

    expectCookieIsTheOnlyCredential()
  })

  it('staff avatar upload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ doc: { id: 1, filename: 'a.png' } }))

    await uploadAvatarAsset(new File(['x'], 'a.png'))

    expectCookieIsTheOnlyCredential()
  })

  it('staff list', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ docs: [] }))

    await fetchStaffUsers()

    expectCookieIsTheOnlyCredential()
  })

  it('location documents', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ docs: [] }))

    await fetchMediaSetOptions()

    expectCookieIsTheOnlyCredential()
  })

  it('single-type listicles', async () => {
    await fetchListicles()

    expectCookieIsTheOnlyCredential()
  })

  it('listicle itineraries', async () => {
    await itineraryPayloadRequest('/api/itineraries')

    expectCookieIsTheOnlyCredential()
  })

  it('location scope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ docs: [{ id: 1 }] }))

    await getArticleLocationScope({ locationKey: 'lima' })

    expectCookieIsTheOnlyCredential()
  })

  it('staging articles', async () => {
    const { fetchPayloadArticles } = await import('../../features/staging/api/articles/articles.api')

    fetchMock.mockResolvedValue(jsonResponse({ docs: [] }))
    await fetchPayloadArticles()

    expectCookieIsTheOnlyCredential()
  })

  it('access permissions', async () => {
    const { fetchAccessPermissions } = await import('../../features/auth/permissions-client')

    fetchMock.mockResolvedValue(jsonResponse({}))
    await fetchAccessPermissions()

    expectCookieIsTheOnlyCredential()
  })

  it('homepage featured content', async () => {
    const { mainHomepageRequest } = await import(
      '../../features/homepageFeaturedContent/mainHomepage/request')

    fetchMock.mockResolvedValue(jsonResponse({ docs: [] }))
    await mainHomepageRequest('/api/pages')

    expectCookieIsTheOnlyCredential()
  })

  it('location homepages', async () => {
    const { locationHomepageRequest } = await import(
      '../../features/homepageFeaturedContent/locationHomepages/request')

    fetchMock.mockResolvedValue(jsonResponse({ docs: [] }))
    await locationHomepageRequest('/api/pages')

    expectCookieIsTheOnlyCredential()
  })

  it('session hydrate and renew', async () => {
    const { hydratePayloadSession } = await import('../../features/auth/payload-auth-client')

    fetchMock.mockResolvedValue(jsonResponse({ user: { id: 1, email: 'a@b.c' }, exp: 9e12 }))
    await hydratePayloadSession({
      expiresAt: Date.now() + 60_000,
      user: { id: '1', email: 'a@b.c' },
    })

    // Nothing in memory can shadow the cookie any more — there is no token to
    // offer. `extractJWT` would have taken a stale one in preference to it.
    expectCookieIsTheOnlyCredential()
  })

  it('leaves the unauthenticated health check uncredentialed', async () => {
    const { checkPayloadHealth } = await import('../../features/auth/payload-auth-client')

    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response)
    await checkPayloadHealth()

    // Nothing to authenticate, so nothing to send.
    expect(lastCredentials()).toBe('omit')
  })
})
