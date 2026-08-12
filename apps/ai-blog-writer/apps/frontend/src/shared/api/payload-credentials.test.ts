import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { payloadRequest, payloadMutation } from './client/http'
import { fetchStaffUsers, uploadAvatarAsset } from '../../features/staff/api/staff.api'
import { fetchMediaSetOptions } from '../../features/locationDocuments/api'
import { fetchListicles } from '../../features/singleTypeListicles/api'
import { payloadRequest as itineraryPayloadRequest } from '../../features/listicleItineraries/api/payloadClient'
import { getArticleLocationScope } from '../locationScope/scope'

/**
 * Every authenticated call to Payload must send the session cookie.
 *
 * These clients grew independently and disagreed: some passed
 * `credentials: 'include'`, some passed `'omit'`, and some named no option at
 * all — which means `'same-origin'`, and Payload is never the same origin as
 * this app. They all worked anyway, because each one carries a `Bearer` header
 * read out of `localStorage`. That header is the thing being removed, so the
 * cookie has to be a real alternative on every path first.
 *
 * Assert on the option rather than on any one call site, so a new Payload
 * client that forgets it is caught here.
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

function lastCredentials(): RequestCredentials | undefined {
  const calls = fetchMock.mock.calls
  const init = calls[calls.length - 1]?.[1] as RequestInit | undefined
  return init?.credentials
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
    await payloadRequest('/api/articles', 'token')

    expect(lastCredentials()).toBe('include')
  })

  it('shared payloadMutation', async () => {
    await payloadMutation('/api/articles/1', 'PATCH', { title: 'x' }, 'token')

    expect(lastCredentials()).toBe('include')
  })

  it('staff avatar upload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ doc: { id: 1, filename: 'a.png' } }))

    await uploadAvatarAsset(new File(['x'], 'a.png'), 'token')

    expect(lastCredentials()).toBe('include')
  })

  it('staff list', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ docs: [] }))

    await fetchStaffUsers('token')

    expect(lastCredentials()).toBe('include')
  })

  it('location documents', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ docs: [] }))

    await fetchMediaSetOptions('token')

    expect(lastCredentials()).toBe('include')
  })

  it('single-type listicles', async () => {
    await fetchListicles('token')

    expect(lastCredentials()).toBe('include')
  })

  it('listicle itineraries', async () => {
    await itineraryPayloadRequest('/api/itineraries', 'token')

    expect(lastCredentials()).toBe('include')
  })

  it('location scope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ docs: [{ id: 1 }] }))

    await getArticleLocationScope({ locationKey: 'lima', token: 'token' })

    expect(lastCredentials()).toBe('include')
  })

  it('leaves the unauthenticated health check uncredentialed', async () => {
    const { checkPayloadHealth } = await import('../../features/auth/payload-auth-client')

    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response)
    await checkPayloadHealth()

    // Nothing to authenticate, so nothing to send.
    expect(lastCredentials()).toBe('omit')
  })
})
