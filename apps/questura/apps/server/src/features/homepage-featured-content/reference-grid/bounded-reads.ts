import { currentPageReadBudget, withReadSlot } from './page-read-budget'

/**
 * Bounded-parallel document reads for one page assembly.
 *
 * Every curated block resolves its slots by looking each referenced document up
 * on its own, and each of those lookups populates relationships several levels
 * deep. On /peru/lima that is 42 document reads which between them issue 428
 * follow-up queries. The blocks already resolve concurrently; the slots inside
 * each block did not, so a block with seven slots paid for seven round trips
 * end to end.
 *
 * Reading them all at once is not the answer either: the Postgres pool is 20
 * connections for the whole server, and a page that opens 42 populated reads
 * simultaneously would starve every other request on the box.
 */

/**
 * How many document reads one page assembly may have in flight.
 *
 * The pool is 20. A populated read holds a connection while it fans out into
 * its own relationship queries, so this has to leave room for the rest of the
 * server -- other page requests, the admin, the revalidation hooks. Six is a
 * quarter of the pool and still turns a seven-slot block from seven sequential
 * round trips into two.
 */
export const MAX_CONCURRENT_DOCUMENT_READS = 6

/**
 * Run `load` over every entry, at most `limit` at a time, and return the
 * results in the original order.
 *
 * Order is the contract: slots are numbered, `invalidItems` reports them by
 * number, and layouts place cards by position. A faster read must never
 * reorder a curated page.
 *
 * Inside a page read budget the `limit` argument is ignored and every entry
 * queues on the page's shared counter instead. Each block owning its own
 * counter is exactly the defect: the comment above describes a page-wide bound
 * that a per-block counter never enforced.
 */
export async function readWithBoundedConcurrency<TIn, TOut>(
  entries: readonly TIn[],
  load: (entry: TIn, index: number) => Promise<TOut>,
  limit: number = MAX_CONCURRENT_DOCUMENT_READS,
): Promise<TOut[]> {
  if (currentPageReadBudget()) {
    return Promise.all(entries.map((entry, index) => withReadSlot(() => load(entry, index))))
  }

  const results = new Array<TOut>(entries.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < entries.length) {
      const index = next
      next += 1
      results[index] = await load(entries[index] as TIn, index)
    }
  }

  const workers = Math.max(1, Math.min(limit, entries.length))
  await Promise.all(Array.from({ length: workers }, worker))

  return results
}
