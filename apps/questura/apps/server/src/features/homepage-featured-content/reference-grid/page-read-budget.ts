import { AsyncLocalStorage } from 'node:async_hooks'

import { MAX_CONCURRENT_DOCUMENT_READS } from './bounded-reads'

/**
 * One document-read budget for one page assembly.
 *
 * `readWithBoundedConcurrency` bounded the reads *inside* one block. The page
 * runs its blocks through `Promise.all`, and each qualifying block called the
 * helper separately, so each one got its own counter: the documented "six
 * reads at a time" was six per block, and seven qualifying blocks could open
 * up to 42 populated reads against a 20-connection pool. The budget was the
 * one thing that had to be shared and was the one thing that was not.
 *
 * Two request-scoped things live here, both keyed to the async context the
 * page assembly runs in:
 *
 *   1. A semaphore. Every document read on the page waits on the same
 *      counter, so peak in-flight reads is the limit, not the limit times the
 *      number of blocks.
 *   2. A read cache. Curated pages repeat references — the same city in a
 *      location grid and a featured row, the same article in two placements —
 *      and each repeat used to be its own populated read. The cache is per
 *      request and thrown away with it, so it can never serve a stale
 *      document to a later reader.
 *
 * `AsyncLocalStorage` rather than a threaded parameter because the read sites
 * are six repositories reached through block-behaviour callbacks; threading a
 * context through all of them would change every block's signature to move a
 * counter. Outside a budget (the admin's own validation paths, tests) the
 * helpers behave exactly as they did before.
 */

export type PageReadBudgetOptions = {
  /** Reads in flight at once, page-wide. */
  limit?: number
  /** Run with the old per-block counters instead. Measurement and rollback. */
  disabled?: boolean
}

export type PageReadStats = {
  /** Reads that actually reached Payload. */
  reads: number
  /** Reads answered from the request cache instead of the database. */
  deduped: number
  /** The most reads in flight at once during the assembly. */
  peakConcurrency: number
  /** The ceiling those reads were held under. */
  limit: number
}

type PageReadBudget = {
  limit: number
  active: number
  peak: number
  reads: number
  deduped: number
  waiters: Array<() => void>
  cache: Map<string, Promise<unknown>>
}

const budgetStore = new AsyncLocalStorage<PageReadBudget>()

/**
 * Whether this async context already holds a slot.
 *
 * Slots have to be re-entrant, because the read sites nest: a block's slot
 * loop takes a slot and calls a repository, and the repository takes one too.
 * Counting both is not conservative, it deadlocks — every slot held by an
 * outer wrapper waiting on an inner acquire that can never be granted. One
 * logical read holds one slot however many layers wrap it.
 */
const holdingSlot = new AsyncLocalStorage<true>()

function acquire(budget: PageReadBudget): Promise<void> | void {
  if (budget.active < budget.limit) {
    budget.active += 1
    if (budget.active > budget.peak) budget.peak = budget.active
    return
  }

  return new Promise<void>((resolve) => {
    budget.waiters.push(resolve)
  })
}

function release(budget: PageReadBudget): void {
  const next = budget.waiters.shift()

  // Hand the slot straight to a waiter rather than freeing and re-taking it:
  // `active` is the count of reads actually in flight, and a slot that is
  // released and immediately retaken was never idle.
  if (next) {
    next()
    return
  }

  budget.active -= 1
}

/**
 * Run `assemble` with one shared read budget, and report what it used.
 *
 * Nested calls reuse the outer budget: a page that resolves draft and
 * published blocks in one request is still one page.
 */
export async function withPageReadBudget<T>(
  assemble: () => Promise<T>,
  options: PageReadBudgetOptions = {},
): Promise<{ result: T; stats: PageReadStats }> {
  // The switch back to per-block counters: for comparing the two under
  // identical conditions, and for backing out in one restart if the shared
  // budget turns out to queue a page behind itself somewhere unexpected.
  if (options.disabled || process.env.PAGE_READ_BUDGET === 'off') {
    const result = await assemble()
    return { result, stats: { reads: 0, deduped: 0, peakConcurrency: 0, limit: 0 } }
  }

  const existing = budgetStore.getStore()

  if (existing) {
    const result = await assemble()
    return { result, stats: readStats(existing) }
  }

  const budget: PageReadBudget = {
    limit: Math.max(1, options.limit ?? MAX_CONCURRENT_DOCUMENT_READS),
    active: 0,
    peak: 0,
    reads: 0,
    deduped: 0,
    waiters: [],
    cache: new Map(),
  }

  const result = await budgetStore.run(budget, assemble)
  return { result, stats: readStats(budget) }
}

function readStats(budget: PageReadBudget): PageReadStats {
  return {
    reads: budget.reads,
    deduped: budget.deduped,
    peakConcurrency: budget.peak,
    limit: budget.limit,
  }
}

/** The budget this async context is running under, if any. */
export function currentPageReadBudget(): PageReadBudget | undefined {
  return budgetStore.getStore()
}

/**
 * Run `read` inside the page's budget, waiting for a slot if the page is
 * already at its limit. Outside a budget, runs immediately.
 */
export async function withReadSlot<T>(read: () => Promise<T>): Promise<T> {
  const budget = budgetStore.getStore()
  if (!budget) return read()
  if (holdingSlot.getStore()) return read()

  await acquire(budget)
  try {
    return await holdingSlot.run(true, read)
  } finally {
    release(budget)
  }
}

/**
 * Read one document at most once per request.
 *
 * `key` must identify the *shape* of the read as well as the document: two
 * reads of the same row with different `select`, `depth` or `populate` are
 * different documents as far as the caller is concerned. Each repository
 * passes a literal prefix naming its own shape, so changing a repository's
 * query without changing its prefix is the way to get this wrong.
 *
 * A rejected read is not cached — the next caller retries rather than
 * inheriting a failure that may have been a transient connection error.
 */
export function readDocumentOnce<T>(key: string, read: () => Promise<T>): Promise<T> {
  const budget = budgetStore.getStore()

  if (!budget) return withReadSlot(read)

  const cached = budget.cache.get(key) as Promise<T> | undefined
  if (cached) {
    budget.deduped += 1
    return cached
  }

  budget.reads += 1
  const pending = withReadSlot(read).catch((error) => {
    budget.cache.delete(key)
    throw error
  })

  budget.cache.set(key, pending)
  return pending
}

/**
 * A per-request override of the page's read budget, for measurement.
 *
 * "Compare concurrency 1, 4 and a bounded higher level under identical
 * conditions" is the acceptance evidence this change owes, and restarting the
 * server between levels does not hold conditions identical. Refused in
 * production: how much of the pool one page may take is an operational
 * decision and not a caller's to make.
 *
 *   x-questura-read-limit: 1     one read at a time
 *   x-questura-read-limit: off   per-block counters, as before this change
 */
export function readBudgetOverrideFromHeaders(
  headers: Headers | undefined,
): PageReadBudgetOptions {
  // Refused in production unless the operator turned diagnostics on for this
  // process (`PUBLIC_API_DIAGNOSTICS=1`), which is how a production build is
  // measured. A caller never decides this for themselves.
  if (!headers) return {}
  if (process.env.NODE_ENV === 'production' && process.env.PUBLIC_API_DIAGNOSTICS !== '1') return {}

  const raw = headers.get('x-questura-read-limit')?.trim().toLowerCase()
  if (!raw) return {}
  if (raw === 'off') return { disabled: true }

  const limit = Number(raw)
  if (!Number.isInteger(limit) || limit < 1) return {}

  return { limit }
}
