import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  chunkTarget,
  deliverClientRevalidation,
  MAX_TARGETS_PER_REQUEST,
  RevalidationUnconfigured,
  triggerClientRevalidation,
} from './delivery'

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


/**
 * Chunking, and why it must not become truncation.
 *
 * The frontend refuses more than a hundred tags or a hundred paths per
 * request. The backend sent the whole target in one, so an author with a few
 * hundred published articles renaming their slug produced a 400, retried
 * eight times and landed in `failed` — with none of their pages refreshed and
 * nothing to say which ones were missed.
 */
function configured() {
  vi.stubEnv('QUESTURA_CLIENT_URL', 'http://127.0.0.1:3100')
  vi.stubEnv('QUESTURA_REVALIDATION_SECRET', 's'.repeat(32))
}

function many(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`)
}

describe('chunkTarget', () => {
  it('never puts more than the receiver accepts in one request', () => {
    const chunks = chunkTarget(many('tag-', 250), many('/p', 130))
    expect(chunks.every((chunk) => chunk.tags.length <= MAX_TARGETS_PER_REQUEST)).toBe(true)
    expect(chunks.every((chunk) => chunk.paths.length <= MAX_TARGETS_PER_REQUEST)).toBe(true)
  })

  it('keeps every entry — the point is bounding, not dropping', () => {
    const tags = many('tag-', 250)
    const paths = many('/p', 130)
    const chunks = chunkTarget(tags, paths)

    expect(chunks.flatMap((chunk) => chunk.tags)).toEqual(tags)
    expect(chunks.flatMap((chunk) => chunk.paths)).toEqual(paths)
  })

  it('is deterministic, so a replay repeats identical requests', () => {
    const first = chunkTarget(many('tag-', 250), many('/p', 130))
    const second = chunkTarget(many('tag-', 250), many('/p', 130))
    expect(first).toEqual(second)
  })
})

describe('delivering a large fan-out', () => {
  it('delivers every chunk and reports delivered only when all of them landed', async () => {
    configured()
    const bodies: Array<{ tags: string[]; paths: string[] }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body))
        return { ok: true } as Response
      }),
    )

    await expect(
      deliverClientRevalidation({ tags: many('tag-', 250), paths: many('/p', 130) }, 'authors:update'),
    ).resolves.toBe('delivered')

    expect(bodies).toHaveLength(3 + 2)
    expect(bodies.flatMap((body) => body.tags)).toHaveLength(250)
    expect(bodies.flatMap((body) => body.paths)).toHaveLength(130)
  })

  // The important half: a middle chunk failing must not silently discard the
  // rest. The job stays pending and the retry replays all of them.
  it('throws when a middle chunk fails, naming which one', async () => {
    configured()
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1
        if (call === 2) return { ok: false, status: 502, text: async () => 'bad gateway' } as unknown as Response
        return { ok: true } as Response
      }),
    )

    await expect(deliverClientRevalidation({ tags: many('tag-', 250), paths: [] }, 'authors:update')).rejects.toThrow(
      /chunk 2 of 3/,
    )
  })

  it('replays cleanly: a repeated successful chunk is just a repeated request', async () => {
    configured()
    const seen: string[][] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        seen.push(JSON.parse(init.body).tags)
        return { ok: true } as Response
      }),
    )

    const target = { tags: many('tag-', 250), paths: [] }
    await deliverClientRevalidation(target, 'authors:update')
    await deliverClientRevalidation(target, 'authors:update')

    expect(seen.slice(0, 3)).toEqual(seen.slice(3))
  })
})
