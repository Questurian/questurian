import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchMainHomepage } from './api'
import { fetchLocationHomepage } from './locationHomepages'

vi.mock('../../shared/api/client/config', () => ({
  PAYLOAD_API_URL: 'http://payload.test'
}))

vi.mock('../../shared/api/client/error-parser', () => ({
  parseErrorResponse: vi.fn()
}))

function mockAbortableFetch() {
  let requestSignal: AbortSignal | undefined

  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined

      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true }
        )
      })
    })
  )

  return () => requestSignal
}

describe('homepage featured API cancellation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('aborts main homepage fetches when TanStack Query cancels them', async () => {
    const getRequestSignal = mockAbortableFetch()
    const queryAbortController = new AbortController()

    const request = fetchMainHomepage(queryAbortController.signal)

    await vi.waitFor(() => expect(getRequestSignal()).toBeDefined())
    queryAbortController.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(getRequestSignal()?.aborted).toBe(true)
  })

  it('aborts location homepage fetches when TanStack Query cancels them', async () => {
    const getRequestSignal = mockAbortableFetch()
    const queryAbortController = new AbortController()

    const request = fetchLocationHomepage(1, queryAbortController.signal)

    await vi.waitFor(() => expect(getRequestSignal()).toBeDefined())
    queryAbortController.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(getRequestSignal()?.aborted).toBe(true)
  })
})
