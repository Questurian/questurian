import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from './apiFetch'
import { API_BASE_URL } from './config'

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('apiFetch', () => {
  it('prefixes the path with the backend base URL', async () => {
    const spy = mockFetch()

    await apiFetch('/youtube2blog/tones')

    expect(spy).toHaveBeenCalledWith(`${API_BASE_URL}/youtube2blog/tones`, undefined)
  })

  it('forwards init untouched', async () => {
    const spy = mockFetch()
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    }

    await apiFetch('/youtube2blog/from-url', init)

    expect(spy).toHaveBeenCalledWith(`${API_BASE_URL}/youtube2blog/from-url`, init)
  })

  it('does not add Content-Type to multipart requests', async () => {
    const spy = mockFetch()
    const body = new FormData()
    body.append('file', new Blob(['x']), 'x.png')

    await apiFetch('/images/upload', { method: 'POST', body })

    const [, forwardedInit] = spy.mock.calls[0] as [string, RequestInit]
    expect(forwardedInit.headers).toBeUndefined()
  })

  it('returns the underlying response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('body', { status: 418 })))

    const response = await apiFetch('/health')

    expect(response.status).toBe(418)
  })
})
