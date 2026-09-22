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
 * rendered from the last answer this process got for the same URL, if that
 * answer is still inside the fallback window. A 404 is an answer, never a
 * failure, so an unpublished or deleted page is never resurrected from here —
 * and a 404 evicts the entry, so it cannot be resurrected by a later outage
 * either.
 *
 * Only for curated city and neighbourhood pages. Articles do not use it: an
 * access change (an article becoming members-only) must not be undone by a
 * stale copy during an outage, and failing loudly is the safe side there.
 *
 * ## What the window actually measures
 *
 * `validatedAt` is **when the origin last confirmed this content**, not when
 * this process last handled it. The distinction is the whole fix. The reader
 * returns it, derived from the response's own `Date` and `Age` headers, so a
 * fetch served out of Next's data cache carries the origin time it was
 * originally issued with. Before this, every successful read — including one
 * the origin never saw — reset the clock, so a page could be served from a
 * fallback indefinitely while each read looked fresh. The stated maximum age
 * was not a maximum of anything.
 *
 * Serving a fallback never renews the clock either, for the same reason.
 *
 * ## What it still cannot promise
 *
 * This bounds the age of the *value this process hands to the renderer*. It
 * does not bound the age of the page a reader sees: Next may store the
 * rendered output in its full-route cache, and nothing here can tell that
 * cache "this render was a fallback, keep it briefly". Narrowing the window
 * (one hour, matching ADR-0003's fallback `revalidate`) limits the damage; it
 * does not remove it. Recorded as a hosted blocker in
 * `docs/capacity/cache-contract.md` rather than papered over with a shared
 * cache nobody has tested.
 *
 * Bounded by entries *and* bytes, oldest dropped first. A five-hundred-entry
 * map of curated homepages is not a fixed amount of memory: a city page
 * response is tens of kilobytes and a large one is far more, so an entry
 * count alone bounds nothing a process actually has.
 *
 * Per process: a fresh serverless instance has nothing to fall back on and
 * fails loudly instead.
 *
 * Dependency-free so the client's node:test suite can run it.
 */

/** ADR-0003's fallback window. Not seven days, which nothing justified. */
export const DEFAULT_FALLBACK_WINDOW_MS = 60 * 60 * 1000;
export const DEFAULT_MAX_ENTRIES = 500;
/** Roughly 32 MB of remembered pages, per process. */
export const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

export type ReadResult<T> = {
  value: T;
  /**
   * When the origin last confirmed this content, in epoch milliseconds.
   * Derived from the response rather than from `Date.now()`, so a cached
   * answer does not look freshly validated.
   */
  validatedAt: number;
};

type Entry = { value: unknown; validatedAt: number; bytes: number };

export type FallbackInfo = {
  /** How old the origin's confirmation is, not how long ago we saw it. */
  ageMs: number;
  /** Everything that has been served from this store, since the process began. */
  served: number;
};

/**
 * The origin's own idea of when this response was current.
 *
 * `Date` is when the origin generated it; `Age` is how long a shared cache
 * has been holding it since. Together they are the closest thing a client has
 * to a content timestamp. Missing or unparseable headers fall back to now,
 * which is the old behaviour — so a backend that says nothing is no worse off
 * than before, and one that says something is believed.
 */
export function validatedAtFrom(response: { headers: { get(name: string): string | null } }, now = Date.now()): number {
  const date = response.headers.get("date");
  const age = Number(response.headers.get("age") ?? "0");
  const issuedAt = date ? Date.parse(date) : Number.NaN;

  if (Number.isNaN(issuedAt)) return now;
  const ageMs = Number.isFinite(age) && age >= 0 ? age * 1000 : 0;
  // Never claim a response is fresher than the moment it was issued.
  return Math.min(now, issuedAt - ageMs);
}

function sizeOf(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

export class LastGood {
  private readonly entries = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly maxAgeMs: number;
  private readonly maxBytes: number;
  private readonly now: () => number;
  private bytes = 0;
  private servedCount = 0;

  // Plain fields rather than parameter properties: node's type stripping,
  // which runs this file's tests, does not support those.
  constructor(
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxAgeMs = DEFAULT_FALLBACK_WINDOW_MS,
    now: () => number = () => Date.now(),
    maxBytes = DEFAULT_MAX_BYTES,
  ) {
    this.maxEntries = maxEntries;
    this.maxAgeMs = maxAgeMs;
    this.maxBytes = maxBytes;
    this.now = now;
  }

  /**
   * Run `read`. On success remember the value against the origin time the
   * reader supplies; on failure return the remembered value if the origin's
   * confirmation is still inside the window, otherwise rethrow.
   */
  async read<T>(
    key: string,
    read: () => Promise<ReadResult<T>>,
    onFallback?: (error: unknown, info: FallbackInfo) => void,
  ): Promise<T> {
    try {
      const { value, validatedAt } = await read();
      // A 404 is an answer: the page is gone, so the memory of it goes too.
      // Otherwise an outage a minute later would bring it back.
      if (value !== null && value !== undefined) this.remember(key, value, validatedAt);
      else this.forget(key);
      return value;
    } catch (error) {
      const entry = this.entries.get(key);
      const ageMs = entry ? this.now() - entry.validatedAt : Number.POSITIVE_INFINITY;
      if (!entry || ageMs > this.maxAgeMs) throw error;

      this.servedCount += 1;
      // Deliberately does not touch `validatedAt`. Serving a fallback is not
      // the origin confirming anything.
      onFallback?.(error, { ageMs, served: this.servedCount });
      return entry.value as T;
    }
  }

  get size(): number {
    return this.entries.size;
  }

  /** Provenance, for the metrics endpoint and for tests. */
  stats() {
    return { entries: this.entries.size, bytes: this.bytes, served: this.servedCount, maxAgeMs: this.maxAgeMs };
  }

  private forget(key: string) {
    const existing = this.entries.get(key);
    if (!existing) return;
    this.bytes -= existing.bytes;
    this.entries.delete(key);
  }

  private remember(key: string, value: unknown, validatedAt: number) {
    this.forget(key);

    const bytes = sizeOf(value);
    this.entries.set(key, { value, validatedAt, bytes });
    this.bytes += bytes;

    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      if (oldest === key && this.entries.size === 1) break;
      this.forget(oldest);
    }
  }
}
