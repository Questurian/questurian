import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeTransactionalReq } from '@/test-utils'

const mocks = vi.hoisted(() => ({
  trigger: vi.fn(),
  refreshSafely: vi.fn(),
  removeSafely: vi.fn(),
  scheduleDrain: vi.fn(),
}))

vi.mock('@/features/public-revalidation/revalidation/delivery', () => ({
  triggerClientRevalidation: mocks.trigger,
  deliverClientRevalidation: vi.fn(),
}))
vi.mock('@/features/articles/public/search-index/service', () => ({
  refreshSearchDocumentSafely: mocks.refreshSafely,
  removeSearchDocumentSafely: mocks.removeSafely,
  refreshSearchDocument: vi.fn(),
}))
vi.mock('./drain-soon', () => ({ scheduleDrain: mocks.scheduleDrain }))
vi.mock('@/shared/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const { requestRevalidation, requestSearchRefresh } = await import('./request')
const { enqueueRefreshJob, RefreshObligationError, revalidateDedupeKey, searchIndexDedupeKey } = await import(
  './enqueue'
)
const { backoffMs, MAX_ATTEMPTS } = await import('./worker')

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * The publication contract: a content change and the obligation to refresh
 * the public site commit together, or the change does not happen.
 *
 * The tests these replace asserted the opposite — that a failed enqueue fell
 * back to inline delivery and the save succeeded anyway. That was the
 * behaviour, and it was the bug: the inline attempt ran inside the save's
 * transaction, so it could publish state that had not committed and might
 * never commit, and when it failed the obligation was gone with nothing
 * recorded to repair it.
 */
describe('requestRevalidation', () => {
  it('records the work in the save transaction instead of doing it inline', async () => {
    const { req, statements } = fakeTransactionalReq()
    await requestRevalidation(req, { tags: ['b', 'a', 'a'], paths: ['/x'] }, 'articles:update')

    expect(statements.some((statement) => statement.startsWith('INSERT INTO refresh_jobs'))).toBe(true)
    expect(mocks.trigger).not.toHaveBeenCalled()
    expect(mocks.scheduleDrain).toHaveBeenCalled()
  })

  it('fails the save when the obligation cannot be written', async () => {
    const { req, statements } = fakeTransactionalReq({ failInsert: true })

    await expect(requestRevalidation(req, { tags: ['a'], paths: [] }, 'articles:update')).rejects.toThrow(
      RefreshObligationError,
    )

    // The savepoint is still taken and rolled back, so the error Payload sees
    // is this one rather than "current transaction is aborted" on whatever
    // statement runs next.
    expect(statements[0]).toBe('SAVEPOINT refresh_outbox')
    expect(statements).toContain('ROLLBACK TO SAVEPOINT')
    expect(mocks.trigger).not.toHaveBeenCalled()
  })

  it('tells the editor what happened and that their edit survived', async () => {
    const { req } = fakeTransactionalReq({ failInsert: true })
    await expect(requestRevalidation(req, { tags: ['a'], paths: [] }, 'articles:update')).rejects.toThrow(
      /your edit is still here/i,
    )
  })

  // A transaction id that resolves to nothing used to fall through to the
  // adapter's own handle, which commits independently: an obligation that
  // outlives a rolled-back save, and no obligation at all when the insert
  // fails.
  it('refuses a transaction id that is not open on this adapter', async () => {
    const { req } = fakeTransactionalReq()
    const mismatched = { ...(req as object), transactionID: 'not-open' } as never

    await expect(requestRevalidation(mismatched, { tags: ['a'], paths: [] }, 'x')).rejects.toThrow(
      /transaction-mismatch/,
    )
  })

  it('refuses a mutation that reached the hooks with no transaction at all', async () => {
    const { req } = fakeTransactionalReq({ transaction: false })
    await expect(requestRevalidation(req, { tags: ['a'], paths: [] }, 'x')).rejects.toThrow(/no-transaction/)
  })

  it('does nothing for an empty target', async () => {
    const { req, statements } = fakeTransactionalReq()
    await requestRevalidation(req, { tags: [], paths: [] }, 'x')
    expect(statements).toEqual([])
    expect(mocks.trigger).not.toHaveBeenCalled()
  })

  // The degraded mode. Production has to acknowledge it by name
  // (assert-production-config.ts); it is not a transparent rollback.
  it('stays inline and best-effort when the outbox is switched off', async () => {
    vi.stubEnv('REFRESH_OUTBOX', 'off')
    const { req, statements } = fakeTransactionalReq()
    await requestRevalidation(req, { tags: ['a'], paths: [] }, 'x')
    expect(statements).toEqual([])
    expect(mocks.trigger).toHaveBeenCalled()
  })
})

describe('requestSearchRefresh', () => {
  it('records a search job keyed by document', async () => {
    const { req, statements } = fakeTransactionalReq()
    await requestSearchRefresh(req, 'articles', 42, 'change')
    expect(statements.some((statement) => statement.startsWith('INSERT INTO refresh_jobs'))).toBe(true)
    expect(mocks.refreshSafely).not.toHaveBeenCalled()
  })

  // Previously this fell back to a direct search write on another connection
  // — mid-save, reading state that had not committed. A delete that failed
  // that way left the document searchable after it was gone.
  it('fails the delete rather than writing the search row on another connection', async () => {
    const { req } = fakeTransactionalReq({ failInsert: true })
    await expect(requestSearchRefresh(req, 'articles', 42, 'delete')).rejects.toThrow(RefreshObligationError)
    expect(mocks.removeSafely).not.toHaveBeenCalled()
  })

  it('still writes inline when the outbox is deliberately off', async () => {
    vi.stubEnv('REFRESH_OUTBOX', 'off')
    const { req } = fakeTransactionalReq()
    await requestSearchRefresh(req, 'articles', 42, 'delete')
    expect(mocks.removeSafely).toHaveBeenCalled()
  })

  it('enqueues inside the transaction, under a savepoint', async () => {
    const { req, statements } = fakeTransactionalReq()
    await enqueueRefreshJob(req, {
      kind: 'search-index',
      dedupeKey: searchIndexDedupeKey('articles', 1),
      target: { type: 'articles', id: '1' },
      reason: 'x',
    })
    expect(statements[0]).toBe('SAVEPOINT refresh_outbox')
    expect(statements).toContain('RELEASE SAVEPOINT refresh_outbox')
  })
})

describe('keys and backoff', () => {
  it('gives the same target the same key regardless of order', () => {
    expect(revalidateDedupeKey({ tags: ['b', 'a'], paths: ['/x'] })).toBe(revalidateDedupeKey({ tags: ['a', 'b', 'a'], paths: ['/x'] }))
    expect(revalidateDedupeKey({ tags: ['a'], paths: [] })).not.toBe(revalidateDedupeKey({ tags: ['b'], paths: [] }))
  })

  it('backs off exponentially, capped at an hour, with bounded jitter', () => {
    expect(backoffMs(1, () => 0)).toBe(30_000)
    expect(backoffMs(2, () => 0)).toBe(60_000)
    expect(backoffMs(MAX_ATTEMPTS, () => 1)).toBeLessThanOrEqual(1.2 * 60 * 60 * 1000)
    expect(backoffMs(50, () => 0)).toBe(60 * 60 * 1000)
  })
})

describe('startPeriodicDrain', () => {
  it('runs by default in production and not in development', async () => {
    const { startPeriodicDrain } = await vi.importActual<typeof import('./drain-soon')>('./drain-soon')
    const payload = { db: { pool: { query: vi.fn(async () => ({ rows: [] })) } } }
    const timers = globalThis as unknown as { __questuraRefreshInterval?: ReturnType<typeof setInterval> }

    expect(startPeriodicDrain(payload, { NODE_ENV: 'development' })).toBe(false)
    expect(startPeriodicDrain(payload, { NODE_ENV: 'production', REFRESH_WORKER_INTERVAL_MS: '0' })).toBe(false)
    expect(startPeriodicDrain(payload, { NODE_ENV: 'production' })).toBe(true)

    clearInterval(timers.__questuraRefreshInterval)
    timers.__questuraRefreshInterval = undefined
  })
})
