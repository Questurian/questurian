import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/shared/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

const { requestRevalidation, requestSearchRefresh } = await import('./request')
const { enqueueRefreshJob, revalidateDedupeKey, searchIndexDedupeKey } = await import('./enqueue')
const { backoffMs, MAX_ATTEMPTS } = await import('./worker')

function fakeReq(options: { fail?: boolean; transaction?: boolean } = {}) {
  const statements: string[] = []
  const execute = vi.fn(async (query: { queryChunks?: Array<{ value?: string[] } | string> }) => {
    const text = (query.queryChunks ?? [])
      .map((chunk) => (typeof chunk === 'object' && chunk && 'value' in chunk ? (chunk.value ?? []).join('') : '?'))
      .join('')
    statements.push(text.trim().split(/\s+/).slice(0, 3).join(' '))
    if (options.fail && text.includes('INSERT INTO refresh_jobs')) throw new Error('relation "refresh_jobs" does not exist')
  })
  const db = { drizzle: { execute }, sessions: { t1: { db: { execute } } }, pool: {} }
  return { req: { transactionID: options.transaction ? 't1' : undefined, payload: { db } }, statements }
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('requestRevalidation', () => {
  it('records the work instead of doing it inline', async () => {
    const { req, statements } = fakeReq({ transaction: true })
    await requestRevalidation(req as never, { tags: ['b', 'a', 'a'], paths: ['/x'] }, 'articles:update')

    expect(statements.some((statement) => statement.startsWith('INSERT INTO refresh_jobs'))).toBe(true)
    expect(mocks.trigger).not.toHaveBeenCalled()
    expect(mocks.scheduleDrain).toHaveBeenCalled()
  })

  // Inside the save's transaction a failed INSERT would abort the transaction
  // and roll the editor's change back. The savepoint confines it.
  it('confines a failed enqueue to a savepoint and falls back to inline delivery', async () => {
    const { req, statements } = fakeReq({ transaction: true, fail: true })
    await requestRevalidation(req as never, { tags: ['a'], paths: [] }, 'articles:update')

    expect(statements[0]).toBe('SAVEPOINT refresh_outbox')
    expect(statements).toContain('ROLLBACK TO SAVEPOINT')
    expect(mocks.trigger).toHaveBeenCalledWith({ tags: ['a'], paths: [] }, 'articles:update')
  })

  it('does nothing for an empty target', async () => {
    const { req, statements } = fakeReq()
    await requestRevalidation(req as never, { tags: [], paths: [] }, 'x')
    expect(statements).toEqual([])
    expect(mocks.trigger).not.toHaveBeenCalled()
  })

  it('stays inline when the outbox is switched off', async () => {
    vi.stubEnv('REFRESH_OUTBOX', 'off')
    const { req, statements } = fakeReq()
    await requestRevalidation(req as never, { tags: ['a'], paths: [] }, 'x')
    expect(statements).toEqual([])
    expect(mocks.trigger).toHaveBeenCalled()
  })
})

describe('requestSearchRefresh', () => {
  it('records a search job keyed by document', async () => {
    const { req, statements } = fakeReq()
    await requestSearchRefresh(req as never, 'articles', 42, 'change')
    expect(statements.some((statement) => statement.startsWith('INSERT INTO refresh_jobs'))).toBe(true)
    expect(mocks.refreshSafely).not.toHaveBeenCalled()
  })

  it('falls back inline, delete included, when the outbox is unavailable', async () => {
    const { req } = fakeReq({ fail: true })
    await requestSearchRefresh(req as never, 'articles', 42, 'delete')
    expect(mocks.removeSafely).toHaveBeenCalled()
  })

  it('does not wrap a savepoint around work outside a transaction', async () => {
    const { req, statements } = fakeReq()
    await enqueueRefreshJob(req as never, {
      kind: 'search-index',
      dedupeKey: searchIndexDedupeKey('articles', 1),
      target: { type: 'articles', id: '1' },
      reason: 'x',
    })
    expect(statements.some((statement) => statement.includes('SAVEPOINT'))).toBe(false)
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
