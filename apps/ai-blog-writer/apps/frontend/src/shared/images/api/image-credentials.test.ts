import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { postFormData, postJson } from './client/imageApiClient'

/**
 * The image routes are the last backend calls that held a token in JavaScript.
 *
 * They are not ordinary API calls: the backend forwards the caller's own
 * Payload JWT so that uploads are created as the acting Staff user rather than
 * a service account. That delegation is why an explicit token was threaded
 * through every one of them, and why they outlived the switch to cookie auth
 * everywhere else.
 *
 * The delegation still happens — the backend now reads the same JWT out of the
 * `payload-token` cookie instead of a header, so the value it forwards is
 * unchanged. What is gone is any need for the browser to hold a readable copy.
 *
 * Both halves are asserted: the cookie goes, and no header follows it. A
 * client that dropped the header without sending the cookie would upload as
 * nobody, and the backend would answer 401 rather than doing something unsafe
 * — but it would still be broken.
 */

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function lastInit(): RequestInit {
  const calls = fetchMock.mock.calls
  return calls[calls.length - 1]?.[1] as RequestInit
}

function expectCookieIsTheOnlyCredential(): void {
  expect(lastInit().credentials).toBe('include')
  expect(new Headers(lastInit().headers).get('Authorization')).toBeNull()
}

describe('image routes authenticate with the session cookie', () => {
  it('postFormData', async () => {
    const body = new FormData()
    body.append('file', new Blob(['x']), 'x.png')

    await postFormData('/images/upload', body)

    expectCookieIsTheOnlyCredential()
  })

  it('postJson', async () => {
    await postJson('/images/generate-social-image', { featuredAssetId: 1 })

    expectCookieIsTheOnlyCredential()
  })

  it('keeps the abort signal working now that it has moved up a slot', async () => {
    const controller = new AbortController()
    const body = new FormData()

    await postFormData('/images/describe-scene', body, controller.signal)

    expect(lastInit().signal).toBe(controller.signal)
  })

  it('still lets multipart requests set their own boundary', async () => {
    const body = new FormData()
    body.append('file', new Blob(['x']), 'x.png')

    await postFormData('/images/upload', body)

    expect(new Headers(lastInit().headers).get('Content-Type')).toBeNull()
  })

  it('composite preview sends the cookie and no header', async () => {
    const { previewCompositeImage } = await import('./composites/composite-image.api')

    fetchMock.mockResolvedValue(
      new Response(new Blob(['x']), {
        status: 200,
        headers: { 'X-Composite-Warnings': '[]' },
      }),
    )
    await previewCompositeImage({
      layout: 'four-up',
      sources: [],
      title: 't',
      altText: 'a',
      photographerCredit: 'c',
      locationRef: 1,
    } as Parameters<typeof previewCompositeImage>[0])

    expectCookieIsTheOnlyCredential()
  })

  it('hanging-composite listing sends the cookie and no header', async () => {
    const { fetchHangingComposites } = await import('./composites/composite-image.api')

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ mediaSets: [] }), { status: 200 }),
    )
    await fetchHangingComposites()

    expectCookieIsTheOnlyCredential()
  })
})
