/**
 * The last successful answer for a curated page, kept in process memory, for
 * when the backend fails while that page is being rebuilt.
 *
 * Next 15 rebuilds a page *blocking* after `revalidateTag`/`revalidatePath`:
 * the first request after a publish waits for a fresh render. Measured on a
 * local production build (docs/capacity/STATUS.md, CAP-04): invalidate
 * `/peru/lima` while the backend answers 503, and every request is a 500 until
 * the backend recovers. Time-based revalidation already serves the stale page
 * while it retries; on-demand invalidation did not.
 *
 * So a curated page that fails with a server error (or no answer at all) is
 * rendered from the last answer this process got for the same URL, if it is
 * younger than `maxAgeMs`. A 404 is an answer, never a failure, so an
 * unpublished or deleted page is never resurrected from here.
 *
 * Only for curated city and neighbourhood pages. Articles do not use it: an
 * access change (an article becoming members-only) must not be undone by a
 * stale copy during an outage, and failing loudly is the safe side there.
 *
 * Bounded: `maxEntries` URLs, oldest dropped first. Per process: a fresh
 * serverless instance has nothing to fall back on and fails loudly instead.
 *
 * Dependency-free so the client's node:test suite can run it.
 */

type Entry = { value: unknown; storedAt: number }

export class LastGood {
  private readonly entries = new Map<string, Entry>()
  private readonly maxEntries: number
  private readonly maxAgeMs: number
  private readonly now: () => number

  // Plain fields rather than parameter properties: node's type stripping,
  // which runs this file's tests, does not support those.
  constructor(maxEntries = 500, maxAgeMs = 7 * 24 * 60 * 60 * 1000, now: () => number = () => Date.now()) {
    this.maxEntries = maxEntries
    this.maxAgeMs = maxAgeMs
    this.now = now
  }

  /**
   * Run `read`. On success remember the value; on failure return the
   * remembered value if it is fresh enough, otherwise rethrow.
   */
  async read<T>(key: string, read: () => Promise<T>, onFallback?: (error: unknown, ageMs: number) => void): Promise<T> {
    try {
      const value = await read()
      if (value !== null && value !== undefined) this.remember(key, value)
      else this.entries.delete(key)
      return value
    } catch (error) {
      const entry = this.entries.get(key)
      const ageMs = entry ? this.now() - entry.storedAt : Infinity
      if (!entry || ageMs > this.maxAgeMs) throw error
      onFallback?.(error, ageMs)
      return entry.value as T
    }
  }

  get size(): number {
    return this.entries.size
  }

  private remember(key: string, value: unknown) {
    this.entries.delete(key)
    this.entries.set(key, { value, storedAt: this.now() })
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }
}
