import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deliverClientRevalidation, RevalidationUnconfigured, triggerClientRevalidation } from './delivery'

/**
 * What counts as "delivered".
 *
 * The outbox decides whether to retry from whether this throws, so the set of
 * outcomes that return normally has to be exactly the set the frontend
 * acknowledged. It used to include "no frontend was configured", which meant
 * a deployment missing one environment variable drained its entire refresh
 * queue to `done` while every public page went stale — the failure the outbox
 * exists to prevent, reached by an unset variable.
 */

const target = { tags: ['a'], paths: ['/x'] }

function stubFetch(response: Partial<Response> | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.stubEnv('QUESTURA_CLIENT_URL', '')
  vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', '')
  vi.stubEnv('FRONTEND_URL', '')
  vi.stubEnv('QUESTURA_REVALIDATION_SECRET', '')
  vi.stubEnv('REVALIDATION_SECRET', '')
  vi.stubEnv('REFRESH_DISCONNECTED', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('deliverClientRevalidation', () => {
  it('throws rather than reporting success when no frontend is configured', async () => {
    await expect(deliverClientRevalidation(target, 'articles:update')).rejects.toThrow(RevalidationUnconfigured)
  })

  it('throws when the destination is set but the secret is not', async () => {
    vi.stubEnv('QUESTURA_CLIENT_URL', 'http://127.0.0.1:3100')
    await expect(deliverClientRevalidation(target, 'articles:update')).rejects.toThrow(/revalidation secret/)
  })

  // The one case where skipping is allowed, and it is still not "delivered".
  it('says it skipped, not that it delivered, in declared disconnected mode', async () => {
    vi.stubEnv('REFRESH_DISCONNECTED', '1')
    await expect(deliverClientRevalidation(target, 'articles:update')).resolves.toBe('skipped-disconnected')
  })

  it('reports delivery only when the frontend acknowledged it', async () => {
    vi.stubEnv('QUESTURA_CLIENT_URL', 'http://127.0.0.1:3100')
    vi.stubEnv('QUESTURA_REVALIDATION_SECRET', 's'.repeat(32))
    stubFetch({ ok: true } as Response)

    await expect(deliverClientRevalidation(target, 'articles:update')).resolves.toBe('delivered')
  })

  it.each([401, 500, 502])('keeps a %s retryable by throwing', async (status) => {
    vi.stubEnv('QUESTURA_CLIENT_URL', 'http://127.0.0.1:3100')
    vi.stubEnv('QUESTURA_REVALIDATION_SECRET', 's'.repeat(32))
    stubFetch({ ok: false, status, text: async () => 'nope' } as unknown as Response)

    await expect(deliverClientRevalidation(target, 'articles:update')).rejects.toThrow(
      new RegExp(`answered ${status}`),
    )
  })

  it('keeps a timeout retryable', async () => {
    vi.stubEnv('QUESTURA_CLIENT_URL', 'http://127.0.0.1:3100')
    vi.stubEnv('QUESTURA_REVALIDATION_SECRET', 's'.repeat(32))
    stubFetch(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }))

    await expect(deliverClientRevalidation(target, 'articles:update')).rejects.toThrow(/aborted/)
  })

  it('does nothing, successfully, for an empty target', async () => {
    await expect(deliverClientRevalidation({ tags: [], paths: [] }, 'x')).resolves.toBe('delivered')
  })
})

describe('triggerClientRevalidation', () => {
  // The degraded path. It swallows everything on purpose, which is exactly
  // why production has to acknowledge REFRESH_OUTBOX=off by name.
  it('never throws, whatever happened', async () => {
    await expect(triggerClientRevalidation(target, 'x')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})
