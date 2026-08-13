import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from './apiFetch'
import { API_BASE_URL } from './config'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function mockFetch(): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', spy)
  return spy
}

function initOf(spy: ReturnType<typeof vi.fn>): RequestInit {
  const [, init] = spy.mock.calls[0] as [string, RequestInit]
  return init
}

function headersOf(spy: ReturnType<typeof vi.fn>): Headers {
  return new Headers(initOf(spy).headers)
}

describe('apiFetch', () => {
  it('prefixes the path with the backend base URL', async () => {
    const spy = mockFetch()

    await apiFetch('/youtube2blog/tones')

    expect(spy.mock.calls[0][0]).toBe(`${API_BASE_URL}/youtube2blog/tones`)
  })

  it('returns the underlying response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('body', { status: 418 })))

    const response = await apiFetch('/health')

    expect(response.status).toBe(418)
  })

  it('preserves the rest of init', async () => {
    const spy = mockFetch()
    const signal = new AbortController().signal

    await apiFetch('/youtube2blog/from-url', { method: 'POST', body: 'x', signal })

    const init = initOf(spy)
    expect(init.method).toBe('POST')
    expect(init.body).toBe('x')
    expect(init.signal).toBe(signal)
  })

  it('does not add Content-Type to multipart requests', async () => {
    const spy = mockFetch()
    const body = new FormData()
    body.append('file', new Blob(['x']), 'x.png')

    await apiFetch('/images/upload', { method: 'POST', body })

    expect(headersOf(spy).get('Content-Type')).toBeNull()
  })
})

describe('apiFetch credentials', () => {
  it("sends the session cookie on every request", async () => {
    const spy = mockFetch()

    await apiFetch('/youtube2blog/tones')

    expect(initOf(spy).credentials).toBe('include')
  })

  it("uses 'include' rather than 'same-origin' — the backend never is", async () => {
    const spy = mockFetch()

    await apiFetch('/prompt2blog/run', { method: 'POST' })

    expect(initOf(spy).credentials).toBe('include')
  })

  it('overrides a call site that asked for a narrower credential mode', async () => {
    const spy = mockFetch()

    await apiFetch('/images/upload', { method: 'POST', credentials: 'omit' })

    expect(initOf(spy).credentials).toBe('include')
  })

  it('sends no Authorization header of its own', async () => {
    const spy = mockFetch()

    await apiFetch('/youtube2blog/from-url', { method: 'POST' })

    expect(headersOf(spy).get('Authorization')).toBeNull()
  })

  it('still forwards an Authorization header the call site set itself', async () => {
    const spy = mockFetch()

    await apiFetch('/images/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer explicit-token' },
    })

    expect(headersOf(spy).get('Authorization')).toBe('Bearer explicit-token')
  })
})

describe('apiFetch with VITE_ABW_API_KEY configured', () => {
  function withKey(key = 'secret-key'): void {
    vi.stubEnv('VITE_ABW_API_KEY', key)
  }

  it('attaches the X-API-Key header', async () => {
    withKey()
    const spy = mockFetch()

    await apiFetch('/youtube2blog/tones')

    expect(headersOf(spy).get('X-API-Key')).toBe('secret-key')
  })

  it('preserves headers the call site already set', async () => {
    withKey()
    const spy = mockFetch()

    await apiFetch('/images/upload-variants', {
      method: 'POST',
      headers: { Authorization: 'Bearer staff-token' },
    })

    const headers = headersOf(spy)
    expect(headers.get('Authorization')).toBe('Bearer staff-token')
    expect(headers.get('X-API-Key')).toBe('secret-key')
  })

  it('treats a whitespace-only key as unset', async () => {
    withKey('   ')
    const spy = mockFetch()

    await apiFetch('/health')

    expect(headersOf(spy).get('X-API-Key')).toBeNull()
  })

  it('still sends the cookie — the key is a gate, not an identity', async () => {
    withKey()
    const spy = mockFetch()

    await apiFetch('/prompt2blog/run', { method: 'POST' })

    expect(initOf(spy).credentials).toBe('include')
  })
})
