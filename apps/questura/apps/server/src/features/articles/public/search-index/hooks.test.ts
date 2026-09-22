import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeTransactionalReq } from '@/test-utils'

const refreshSearchDocumentSafely = vi.fn()
const removeSearchDocumentSafely = vi.fn()

vi.mock('./service', () => ({
  get refreshSearchDocumentSafely() {
    return refreshSearchDocumentSafely
  },
  get removeSearchDocumentSafely() {
    return removeSearchDocumentSafely
  },
}))
vi.mock('@/features/refresh-outbox/drain-soon', () => ({ scheduleDrain: vi.fn() }))

const { syncSearchIndexForCollection } = await import('./hooks')

/**
 * The hooks record an obligation in the save's transaction; they no longer
 * write the search row themselves. So these assert the enqueued job, and the
 * req has to carry a transaction — without one the hook now refuses, which is
 * the publication contract (features/refresh-outbox/request.ts).
 */
function transactionalReq() {
  return fakeTransactionalReq()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('syncSearchIndexForCollection', () => {
  it('maps each collection to the type key the job carries', async () => {
    for (const [collection, type] of [
      ['articles', 'articles'],
      ['single-type-listicles', 'maps'],
      ['listicle-itineraries', 'itineraries'],
    ] as const) {
      const { req, sql } = transactionalReq()
      const hooks = syncSearchIndexForCollection(collection)
      await hooks.afterChange({ doc: { id: 5 }, req } as never)

      expect(sql()).toContain('INSERT INTO refresh_jobs')
      expect(sql()).toContain(`search:${type}:5`)
      // The row is written by the worker after commit, never by the hook.
      expect(refreshSearchDocumentSafely).not.toHaveBeenCalled()
    }
  })

  // Publishing, unpublishing and editing a paragraph are all document changes,
  // and the refresh handles all three because its insert finds nothing for a
  // draft. One hook, no transition to forget.
  it('enqueues on every change, whatever the transition', async () => {
    const { req, statements } = transactionalReq()
    const hooks = syncSearchIndexForCollection('articles')

    await hooks.afterChange({ doc: { id: 1, status: 'published' }, req } as never)
    await hooks.afterChange({ doc: { id: 1, status: 'draft' }, req } as never)

    expect(statements.filter((statement) => statement.startsWith('INSERT INTO refresh_jobs'))).toHaveLength(2)
  })

  it('enqueues a delete under the same key, so the newest change wins', async () => {
    const { req, sql } = transactionalReq()
    const hooks = syncSearchIndexForCollection('articles')
    await hooks.afterDelete({ doc: { id: 9 }, req } as never)

    expect(sql()).toContain('search:articles:9')
    expect(sql()).toContain('articles:delete')
    expect(removeSearchDocumentSafely).not.toHaveBeenCalled()
  })

  it('returns the document unchanged so it stays a pass-through hook', async () => {
    const hooks = syncSearchIndexForCollection('articles')
    const doc = { id: 3 }

    expect(await hooks.afterChange({ doc, req: transactionalReq().req } as never)).toBe(doc)
    expect(await hooks.afterDelete({ doc, req: transactionalReq().req } as never)).toBe(doc)
  })

  it('does nothing for a document with no id', async () => {
    const { req, statements } = transactionalReq()
    const hooks = syncSearchIndexForCollection('articles')
    await hooks.afterChange({ doc: {}, req } as never)

    expect(statements).toEqual([])
  })
})
