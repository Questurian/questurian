import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock('payload', () => ({
  getPayload: vi.fn().mockResolvedValue({
    find: mocks.find,
    create: mocks.create,
    delete: mocks.deleteMany,
  }),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

vi.mock('@/features/articles/public/indexItem', () => ({
  serializeIndexItem: (doc: Record<string, unknown>, type: string) => ({
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    excerpt: null,
    publishedAt: null,
    href: `/${type}/${doc.slug}`,
    thumbnail: null,
  }),
}))

import { addBookmark, listBookmarkPage, removeBookmark } from './service'

type Row = { id: number; targetType: string; targetId: number; createdAt: string }

function bookmarkRows(rows: Row[]) {
  return { docs: rows, totalDocs: rows.length, totalPages: 1 }
}

describe('Bookmark list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the newest-bookmarked-first order across collections', async () => {
    // Two collections are fetched in parallel and neither knows about the
    // other's ordering, so the projection back through the bookmark rows is
    // the only thing keeping the page in `-createdAt` order.
    mocks.find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'bookmarks') {
        return bookmarkRows([
          { id: 1, targetType: 'itineraries', targetId: 70, createdAt: '2026-08-19T00:00:00.000Z' },
          { id: 2, targetType: 'articles', targetId: 10, createdAt: '2026-08-18T00:00:00.000Z' },
          { id: 3, targetType: 'articles', targetId: 11, createdAt: '2026-08-17T00:00:00.000Z' },
        ])
      }
      if (collection === 'articles') {
        return { docs: [{ id: 11, title: 'Older', slug: 'older' }, { id: 10, title: 'Newer', slug: 'newer' }] }
      }
      return { docs: [{ id: 70, title: 'Trip', slug: 'trip' }] }
    })

    const page = await listBookmarkPage({ authUserId: 'u1', page: 1, pageSize: 20 })

    expect(page.items.map((item) => item.title)).toEqual(['Trip', 'Newer', 'Older'])
    expect(page.items.map((item) => item.targetType)).toEqual(['itineraries', 'articles', 'articles'])
  })

  it('omits an unavailable target silently and leaves the count alone', async () => {
    // ADR-0010: an unpublished or deleted target produces no placeholder, and
    // the counts describe rows held so they stay stable while an editor works.
    mocks.find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'bookmarks') {
        return bookmarkRows([
          { id: 1, targetType: 'articles', targetId: 10, createdAt: '2026-08-18T00:00:00.000Z' },
          { id: 2, targetType: 'articles', targetId: 99, createdAt: '2026-08-17T00:00:00.000Z' },
        ])
      }
      // 99 is unpublished, so the published gate simply does not return it.
      return { docs: [{ id: 10, title: 'Live', slug: 'live' }] }
    })

    const page = await listBookmarkPage({ authUserId: 'u1', page: 1, pageSize: 20 })

    expect(page.items).toHaveLength(1)
    expect(page.totalDocs).toBe(2)
  })

  it('resolves targets through the same published gate as the public index', async () => {
    mocks.find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'bookmarks') {
        return bookmarkRows([
          { id: 1, targetType: 'articles', targetId: 10, createdAt: '2026-08-18T00:00:00.000Z' },
        ])
      }
      return { docs: [] }
    })

    await listBookmarkPage({ authUserId: 'u1', page: 1, pageSize: 20 })

    const targetQuery = mocks.find.mock.calls.find(([args]) => args.collection === 'articles')?.[0]
    expect(targetQuery.where.and).toContainEqual({ status: { equals: 'published' } })
  })

  it('reports the target access tier so the list can mark unreadable items', async () => {
    mocks.find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'bookmarks') {
        return bookmarkRows([
          { id: 1, targetType: 'articles', targetId: 10, createdAt: '2026-08-18T00:00:00.000Z' },
          { id: 2, targetType: 'articles', targetId: 11, createdAt: '2026-08-17T00:00:00.000Z' },
        ])
      }
      return {
        docs: [
          { id: 10, title: 'Gated', slug: 'gated', access: 'member' },
          // No `access` at all falls back to free, mirroring `isGatedItem`.
          { id: 11, title: 'Free', slug: 'free' },
        ],
      }
    })

    const page = await listBookmarkPage({ authUserId: 'u1', page: 1, pageSize: 20 })

    expect(page.items.map((item) => item.access)).toEqual(['member', 'free'])
  })

  it('clamps an oversized page size rather than honouring it', async () => {
    mocks.find.mockResolvedValue(bookmarkRows([]))

    await listBookmarkPage({ authUserId: 'u1', page: 1, pageSize: 5000 })

    expect(mocks.find.mock.calls[0][0].limit).toBe(50)
  })
})

describe('Bookmark writes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats a duplicate as the state the visitor asked for', async () => {
    // The compound unique index is the real guard against a double-click, so
    // its error must not surface as a failure to the reader.
    mocks.create.mockRejectedValue(new Error('duplicate key value violates unique constraint'))
    mocks.find.mockResolvedValue({ docs: [{ id: 1 }] })

    await expect(
      addBookmark('u1', { targetType: 'articles', targetId: 10 })
    ).resolves.toBeUndefined()
  })

  it('still throws when the create failed for some other reason', async () => {
    mocks.create.mockRejectedValue(new Error('connection terminated'))
    mocks.find.mockResolvedValue({ docs: [] })

    await expect(addBookmark('u1', { targetType: 'articles', targetId: 10 })).rejects.toThrow(
      'connection terminated'
    )
  })

  it('scopes a delete to the calling visitor', async () => {
    mocks.deleteMany.mockResolvedValue({ docs: [] })

    await removeBookmark('u1', { targetType: 'maps', targetId: 5 })

    expect(mocks.deleteMany.mock.calls[0][0].where.and).toContainEqual({
      authUserId: { equals: 'u1' },
    })
  })
})
