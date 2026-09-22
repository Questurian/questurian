import { describe, expect, it, vi } from 'vitest'

import { refreshSearchDocumentFenced } from './service'

/**
 * The side effect has to be fenced too.
 *
 * Guarding the outbox row alone left the damage unguarded: a worker whose
 * lease expired still re-derives the search row from what it read and writes
 * it after the winner wrote the current one, so the document is searchable as
 * a version that no longer exists — while the outbox says done.
 */

type Query = { sql: string; values: unknown[] }

function fakePool(job: { claim_token: string | null; generation: number; claimed_generation: number | null } | null) {
  const queries: Query[] = []
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      queries.push({ sql, values })
      if (sql.includes('FROM refresh_jobs')) return { rows: job ? [job] : [], rowCount: job ? 1 : 0 }
      return { rows: [], rowCount: 0 }
    }),
    release: vi.fn(),
  }

  return {
    queries,
    client,
    pool: {
      query: client.query,
      connect: async () => client,
    },
  }
}

const OWNED = { claim_token: 'tok-a', generation: 3, claimed_generation: 3 }

describe('refreshSearchDocumentFenced', () => {
  it('writes the row when the claim is still ours and the generation has not moved', async () => {
    const { pool, queries } = fakePool(OWNED)

    await expect(refreshSearchDocumentFenced(pool as never, 'articles', 7, { jobId: 1, claimToken: 'tok-a' })).resolves.toBe(
      'written',
    )

    expect(queries.map((query) => query.sql.trim().split(/\s+/)[0])).toEqual([
      'BEGIN',
      'SELECT',
      'DELETE',
      'WITH', // the insert is a CTE (source-sql.ts)
      'COMMIT',
    ])
  })

  it('locks the job row for the write, so an enqueue cannot land in between', async () => {
    const { pool, queries } = fakePool(OWNED)
    await refreshSearchDocumentFenced(pool as never, 'articles', 7, { jobId: 1, claimToken: 'tok-a' })

    const check = queries.find((query) => query.sql.includes('FROM refresh_jobs'))
    expect(check?.sql).toContain('FOR UPDATE')
  })

  it('writes nothing when another worker now holds the claim', async () => {
    const { pool, queries } = fakePool({ ...OWNED, claim_token: 'tok-b' })

    await expect(refreshSearchDocumentFenced(pool as never, 'articles', 7, { jobId: 1, claimToken: 'tok-a' })).resolves.toBe(
      'superseded',
    )

    expect(queries.some((query) => query.sql.includes('public_search_documents'))).toBe(false)
    expect(queries.at(-1)?.sql).toBe('ROLLBACK')
  })

  // The unpublish case: a delete lands while an older change job is running.
  // Without this, the stale job re-inserts the row and the deleted document
  // stays searchable.
  it('writes nothing when a newer change has bumped the generation', async () => {
    const { pool, queries } = fakePool({ claim_token: 'tok-a', generation: 4, claimed_generation: 3 })

    await expect(refreshSearchDocumentFenced(pool as never, 'articles', 7, { jobId: 1, claimToken: 'tok-a' })).resolves.toBe(
      'superseded',
    )
    expect(queries.some((query) => query.sql.includes('public_search_documents'))).toBe(false)
  })

  it('writes nothing when the job row has been pruned away', async () => {
    const { pool } = fakePool(null)
    await expect(refreshSearchDocumentFenced(pool as never, 'articles', 7, { jobId: 1, claimToken: 'tok-a' })).resolves.toBe(
      'superseded',
    )
  })

  it('returns the connection whatever happens', async () => {
    const { pool, client } = fakePool({ ...OWNED, claim_token: 'tok-b' })
    await refreshSearchDocumentFenced(pool as never, 'articles', 7, { jobId: 1, claimToken: 'tok-a' })
    expect(client.release).toHaveBeenCalled()
  })
})
