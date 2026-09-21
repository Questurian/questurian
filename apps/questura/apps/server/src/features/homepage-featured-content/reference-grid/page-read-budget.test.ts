import { afterEach, describe, expect, it, vi } from 'vitest'

import { readWithBoundedConcurrency } from './bounded-reads'
import {
  prefetchDocuments,
  readBudgetOverrideFromHeaders,
  readDocumentBySpec,
  readDocumentOnce,
  withPageReadBudget,
  withReadSlot,
} from './page-read-budget'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('withPageReadBudget', () => {
  // The finding: each block called readWithBoundedConcurrency separately, so
  // seven blocks of six was 42 reads in flight against a 20-connection pool.
  it('holds every block on the page to one shared limit', async () => {
    let active = 0
    let peak = 0

    async function read() {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active -= 1
      return 'doc'
    }

    const blocks = Array.from({ length: 7 }, (_, block) =>
      Array.from({ length: 6 }, (_, slot) => `${block}:${slot}`),
    )

    const { stats } = await withPageReadBudget(async () =>
      Promise.all(blocks.map((slots) => readWithBoundedConcurrency(slots, () => read()))),
    )

    expect(peak).toBeLessThanOrEqual(6)
    expect(stats.peakConcurrency).toBeLessThanOrEqual(6)
    expect(stats.limit).toBe(6)
  })

  it('keeps results in slot order under the shared limit', async () => {
    const entries = [50, 1, 30, 2, 40, 3, 20, 4]

    const { result } = await withPageReadBudget(async () =>
      readWithBoundedConcurrency(entries, async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, ms % 7))
        return ms
      }),
    )

    expect(result).toEqual(entries)
  })

  it('reads a repeated reference once per request', async () => {
    let reads = 0
    const read = async () => {
      reads += 1
      return { id: 4 }
    }

    const { result, stats } = await withPageReadBudget(async () =>
      Promise.all([
        readDocumentOnce('location-grid:4', read),
        readDocumentOnce('location-grid:4', read),
        readDocumentOnce('location-grid:9', read),
      ]),
    )

    expect(reads).toBe(2)
    expect(stats.reads).toBe(2)
    expect(stats.deduped).toBe(1)
    expect(result[0]).toBe(result[1])
  })

  // Two reads of the same row with different select/depth/populate are not the
  // same document to the caller, so the key has to name the shape.
  it('treats different read shapes for one row as different documents', async () => {
    let reads = 0
    const read = async () => {
      reads += 1
      return reads
    }

    await withPageReadBudget(async () =>
      Promise.all([
        readDocumentOnce('featured:articles:4', read),
        readDocumentOnce('location-grid:4', read),
      ]),
    )

    expect(reads).toBe(2)
  })

  it('does not cache a failed read', async () => {
    let attempts = 0
    const read = async () => {
      attempts += 1
      if (attempts === 1) throw new Error('connection reset')
      return 'ok'
    }

    await withPageReadBudget(async () => {
      await expect(readDocumentOnce('tour:1', read)).rejects.toThrow('connection reset')
      await expect(readDocumentOnce('tour:1', read)).resolves.toBe('ok')
    })

    expect(attempts).toBe(2)
  })

  it('hands a released slot straight to a waiter', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    let secondStarted = false

    await withPageReadBudget(
      async () => {
        const a = withReadSlot(() => first.promise)
        const b = withReadSlot(async () => {
          secondStarted = true
          return second.promise
        })

        await Promise.resolve()
        expect(secondStarted).toBe(false)

        first.resolve('a')
        await a
        await Promise.resolve()
        expect(secondStarted).toBe(true)

        second.resolve('b')
        await b
      },
      { limit: 1 },
    )
  })

  it('leaves reads outside a budget exactly as they were', async () => {
    let reads = 0
    const results = await readWithBoundedConcurrency([1, 2, 3], async (value) => {
      reads += 1
      return value * 2
    })

    expect(results).toEqual([2, 4, 6])
    expect(reads).toBe(3)
  })
})

describe('nested reads', () => {
  // This is the shape the real code has and the first version deadlocked on:
  // a block's slot loop takes a slot, then the repository it calls takes one
  // too. With six entries and a limit of six, every slot was held by an outer
  // wrapper waiting on an inner acquire that could never be granted.
  it('does not deadlock when a slot loop calls a repository that also takes a slot', async () => {
    const finished: number[] = []

    const { result } = await withPageReadBudget(
      async () =>
        readWithBoundedConcurrency([1, 2, 3, 4, 5, 6, 7], async (entry) =>
          readDocumentOnce(`doc:${entry}`, async () =>
            withReadSlot(async () => {
              await new Promise((resolve) => setTimeout(resolve, 1))
              finished.push(entry)
              return entry * 10
            }),
          ),
        ),
      { limit: 6 },
    )

    expect(result).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(finished).toHaveLength(7)
  })

  it('counts a nested read as one slot, not two', async () => {
    let peak = 0
    let active = 0

    const { stats } = await withPageReadBudget(
      async () =>
        readWithBoundedConcurrency([1, 2, 3, 4], async (entry) =>
          withReadSlot(async () => {
            active += 1
            peak = Math.max(peak, active)
            await new Promise((resolve) => setTimeout(resolve, 1))
            active -= 1
            return entry
          }),
        ),
      { limit: 2 },
    )

    expect(peak).toBe(2)
    expect(stats.peakConcurrency).toBe(2)
  })
})

describe('readBudgetOverrideFromHeaders', () => {
  const headers = new Headers({ 'x-questura-read-limit': '1' })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('honours the measurement header outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(readBudgetOverrideFromHeaders(headers)).toEqual({ limit: 1 })
  })

  // The route used to skip coalescing on the header's mere presence, so a
  // production caller could force a full assembly per request.
  it('ignores it in production, so a caller cannot skip coalescing either', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_API_DIAGNOSTICS', '')
    expect(readBudgetOverrideFromHeaders(headers)).toEqual({})
  })

  it('honours it in production only when the operator turned diagnostics on', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_API_DIAGNOSTICS', '1')
    expect(readBudgetOverrideFromHeaders(headers)).toEqual({ limit: 1 })
  })
})

describe('prefetchDocuments', () => {
  const spec = {
    collection: 'accommodations',
    key: (id: string | number) => `hotel:${id}`,
    depth: 2,
    select: { id: true },
    normalize: (doc: Record<string, unknown>) => ({ normalized: doc.id }),
  }

  it('reads a block in one query and answers every slot from it', async () => {
    const payload = {
      find: vi.fn(async (_args: Record<string, unknown>) => ({ docs: [{ id: 1 }, { id: 2 }] })),
      findByID: vi.fn(async (_args: Record<string, unknown>) => null),
    }

    const { result, stats } = await withPageReadBudget(async () => {
      await prefetchDocuments(payload, spec, [1, 2, 3, 2])
      return Promise.all([1, 2, 3].map((id) => readDocumentBySpec(payload, spec, id)))
    })

    expect(payload.find).toHaveBeenCalledTimes(1)
    expect(payload.find.mock.calls[0]![0]).toMatchObject({ where: { id: { in: ['1', '2', '3'] } }, depth: 2, pagination: false })
    expect(payload.findByID).not.toHaveBeenCalled()
    // A document the batch did not return is a not-found, exactly as findByID would say.
    expect(result).toEqual([{ normalized: 1 }, { normalized: 2 }, null])
    expect(stats).toMatchObject({ reads: 1, batches: 1, prefetched: 3, deduped: 0 })
  })

  it('falls back to per-slot reads when the batch fails', async () => {
    const payload = {
      find: vi.fn(async (_args: Record<string, unknown>): Promise<{ docs: unknown[] }> => {
        throw new Error('timeout')
      }),
      findByID: vi.fn(async (args: Record<string, unknown>) => ({ id: args.id })),
    }

    const { result } = await withPageReadBudget(async () => {
      await prefetchDocuments(payload, spec, [1])
      return readDocumentBySpec(payload, spec, 1)
    })

    expect(result).toEqual({ normalized: 1 })
    expect(payload.findByID).toHaveBeenCalledTimes(1)
  })

  it('does nothing outside a page budget', async () => {
    const payload = { find: vi.fn(), findByID: vi.fn() }
    await prefetchDocuments(payload, spec, [1])
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('propagates a real failure from the single read instead of omitting the slot', async () => {
    const payload = {
      find: vi.fn(),
      findByID: vi.fn(async () => {
        throw new Error('canceling statement due to statement timeout')
      }),
    }
    await expect(
      withPageReadBudget(() => readDocumentBySpec(payload, spec, 9)),
    ).rejects.toThrow('statement timeout')
  })
})
