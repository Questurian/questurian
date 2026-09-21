import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  rebuildSearchIndex,
  refreshSearchDocument,
  refreshSearchDocumentSafely,
  removeSearchDocument,
  searchIndexHasRows,
} from './service'

vi.mock('@/shared/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

function poolWithClient() {
  const statements: string[] = []
  const client = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql.trim().split('\n')[0]!.trim())
      return { rows: [], rowCount: 24 }
    }),
    release: vi.fn(),
  }
  return {
    statements,
    client,
    pool: {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      connect: vi.fn(async () => client),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('refreshSearchDocument', () => {
  // Delete then insert, and the insert finds nothing for a draft. That is what
  // makes unpublishing, deleting and editing one code path instead of three.
  it('deletes and re-inserts in one transaction', async () => {
    const { pool, statements, client } = poolWithClient()

    await refreshSearchDocument(pool, 'articles', 7)

    expect(statements[0]).toBe('BEGIN')
    expect(statements[1]).toContain('DELETE FROM public_search_documents')
    expect(statements[2]).toContain('WITH')
    expect(statements[3]).toBe('COMMIT')
    expect(client.release).toHaveBeenCalled()
  })

  it('rolls back and rethrows when the insert fails', async () => {
    const { pool, client } = poolWithClient()
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO public_search_documents')) throw new Error('boom')
      return { rows: [], rowCount: 0 }
    })

    await expect(refreshSearchDocument(pool, 'articles', 7)).rejects.toThrow('boom')
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })

  it('ignores an id that is not a whole number', async () => {
    const { pool } = poolWithClient()
    await refreshSearchDocument(pool, 'articles', 'not-a-number')
    expect(pool.connect).not.toHaveBeenCalled()
  })
})

describe('refreshSearchDocumentSafely', () => {
  // An editor publishing an article must not see an error because a search row
  // could not be written. The row is rebuildable; the edit is not.
  it('never throws out of a save', async () => {
    const { pool, client } = poolWithClient()
    client.query.mockRejectedValue(new Error('connection reset'))

    await expect(refreshSearchDocumentSafely(pool, 'maps', 3)).resolves.toBeUndefined()
  })

  it('does nothing without a pool', async () => {
    await expect(refreshSearchDocumentSafely(undefined, 'maps', 3)).resolves.toBeUndefined()
  })
})

describe('removeSearchDocument', () => {
  it('deletes the row without trying to rebuild it', async () => {
    const { pool } = poolWithClient()
    await removeSearchDocument(pool, 'itineraries', 12)

    expect(pool.query).toHaveBeenCalledTimes(1)
    expect(pool.query.mock.calls[0]![0]).toContain('DELETE FROM public_search_documents')
  })
})

describe('rebuildSearchIndex', () => {
  it('clears and refills in one transaction and reports the row count', async () => {
    const { pool, statements } = poolWithClient()

    const rows = await rebuildSearchIndex(pool)

    expect(rows).toBe(24)
    expect(statements[0]).toBe('BEGIN')
    expect(statements[1]).toContain('DELETE FROM public_search_documents')
    expect(statements[3]).toBe('COMMIT')
  })
})

describe('searchIndexHasRows', () => {
  it('is true when the table has at least one row', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [{ '?column?': 1 }] })) }
    expect(await searchIndexHasRows(pool)).toBe(true)
  })

  it('is false when the table is empty', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [] })) }
    expect(await searchIndexHasRows(pool)).toBe(false)
  })
})
