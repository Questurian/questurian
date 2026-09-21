import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const { syncSearchIndexForCollection } = await import('./hooks')

const pool = { query: vi.fn() }
const req = { payload: { db: { pool } } } as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('syncSearchIndexForCollection', () => {
  it('maps each collection to the type key the table stores', async () => {
    for (const [collection, type] of [
      ['articles', 'articles'],
      ['single-type-listicles', 'maps'],
      ['listicle-itineraries', 'itineraries'],
    ] as const) {
      const hooks = syncSearchIndexForCollection(collection)
      await hooks.afterChange({ doc: { id: 5 }, req } as never)
      expect(refreshSearchDocumentSafely).toHaveBeenLastCalledWith(pool, type, 5)
    }
  })

  // Publishing, unpublishing and editing a paragraph are all document changes,
  // and the refresh handles all three because its insert finds nothing for a
  // draft. One hook, no transition to forget.
  it('refreshes on every change, whatever the transition', async () => {
    const hooks = syncSearchIndexForCollection('articles')

    await hooks.afterChange({ doc: { id: 1, status: 'published' }, req } as never)
    await hooks.afterChange({ doc: { id: 1, status: 'draft' }, req } as never)

    expect(refreshSearchDocumentSafely).toHaveBeenCalledTimes(2)
  })

  it('removes the row on delete', async () => {
    const hooks = syncSearchIndexForCollection('articles')
    await hooks.afterDelete({ doc: { id: 9 }, req } as never)

    expect(removeSearchDocumentSafely).toHaveBeenCalledWith(pool, 'articles', 9)
  })

  it('returns the document unchanged so it stays a pass-through hook', async () => {
    const hooks = syncSearchIndexForCollection('articles')
    const doc = { id: 3 }

    expect(await hooks.afterChange({ doc, req } as never)).toBe(doc)
    expect(await hooks.afterDelete({ doc, req } as never)).toBe(doc)
  })

  it('does nothing for a document with no id', async () => {
    const hooks = syncSearchIndexForCollection('articles')
    await hooks.afterChange({ doc: {}, req } as never)

    expect(refreshSearchDocumentSafely).not.toHaveBeenCalled()
  })
})
