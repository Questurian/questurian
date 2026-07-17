import { describe, expect, it, vi } from 'vitest'

import { hasPublishedAuthorContent, type AuthorContentCounter } from './authorVisibility'

const ALL_TYPES = ['articles', 'maps', 'itineraries'] as const

function createPayload(countsByCollection: Record<string, number>) {
  const count = vi.fn(async (args: { collection: string }) => ({
    totalDocs: countsByCollection[args.collection] ?? 0,
  }))
  return { count, payload: { count } as unknown as AuthorContentCounter }
}

describe('hasPublishedAuthorContent', () => {
  it('is visible with published work in any collection', async () => {
    const { payload } = createPayload({ 'listicle-itineraries': 1 })

    await expect(hasPublishedAuthorContent(payload, 7, [...ALL_TYPES])).resolves.toBe(true)
  })

  it('is not visible with no published work anywhere', async () => {
    const { count, payload } = createPayload({})

    await expect(hasPublishedAuthorContent(payload, 7, [...ALL_TYPES])).resolves.toBe(false)
    expect(count).toHaveBeenCalledTimes(ALL_TYPES.length)
  })

  it('only counts published items by the given author', async () => {
    const { count, payload } = createPayload({ articles: 1 })

    await hasPublishedAuthorContent(payload, 42, [...ALL_TYPES])

    for (const [args] of count.mock.calls as Array<[Record<string, unknown>]>) {
      expect(args.where).toEqual({
        and: [
          { author: { equals: 42 } },
          { status: { equals: 'published' } },
        ],
      })
      expect(args.overrideAccess).toBe(true)
    }
  })
})
