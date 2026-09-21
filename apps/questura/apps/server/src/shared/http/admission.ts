/**
 * Bounded admission for expensive public work, per process.
 *
 * The page read budget bounds the reads *inside* one page assembly. Nothing
 * bounded how many assemblies ran at once. Measured on a local production
 * build (docs/capacity/STATUS.md, CAP-01): the Lima page completes at a flat
 * ~4–5 assemblies per second whatever the concurrency, the 20-connection pool
 * is full from 4 concurrent assemblies, and at 6 arrivals per second the
 * queue simply grew — p95 10.9 s, 296 requests waiting for a connection, no
 * request refused, until clients gave up. Latency past saturation is not
 * throughput; it is a queue nobody decided to allow.
 *
 * A gate admits `limit` pieces of work at once, holds at most `maxQueue`
 * more for at most `maxWaitMs`, and refuses the rest immediately. A refusal
 * is a fast 503 with `Retry-After`, which a CDN or the frontend's last-good
 * output can absorb; a 10-second timeout is absorbed by nobody.
 *
 * Per process. The total bound is `limit × processes`, which is only a bound
 * when the process count is — see `pool-budget.ts`, which production requires.
 *
 * What it does not do: cancel SQL. An admitted request whose client went away
 * still runs to completion (statement timeouts bound it). A *waiting* request
 * whose client went away leaves the queue at once, so abandoned requests never
 * hold a place in line.
 */

export type AdmissionOptions = {
  /** Pieces of work running at once. */
  limit: number
  /** Pieces of work allowed to wait. Beyond this, refuse immediately. */
  maxQueue: number
  /** Longest a piece of work may wait before being refused. */
  maxWaitMs: number
}

export type AdmissionRefusal = 'queue-full' | 'queue-timeout' | 'aborted'

export class AdmissionRefused extends Error {
  constructor(
    readonly gate: string,
    readonly reason: AdmissionRefusal,
  ) {
    super(`Admission refused by ${gate}: ${reason}`)
    this.name = 'AdmissionRefused'
  }
}

export type AdmissionStats = AdmissionOptions & {
  active: number
  queued: number
  admitted: number
  refused: Record<AdmissionRefusal, number>
  /** Longest any admitted piece of work waited, since the process started. */
  maxWaitedMs: number
}

type Waiter = {
  enqueuedAt: number
  grant: () => void
  refuse: (reason: AdmissionRefusal) => void
}

export class AdmissionGate {
  private active = 0
  private readonly queue: Waiter[] = []
  private readonly counters = {
    admitted: 0,
    refused: { 'queue-full': 0, 'queue-timeout': 0, aborted: 0 } as Record<AdmissionRefusal, number>,
    maxWaitedMs: 0,
  }

  constructor(
    readonly name: string,
    private readonly options: AdmissionOptions,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Run `work` once admitted. Resolves to its result and how long it waited;
   * rejects with `AdmissionRefused` if it was never admitted. The slot is
   * released in `finally`, so a throwing or rejecting `work` cannot leak it.
   */
  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<{ value: T; waitedMs: number }> {
    const waitedMs = await this.acquire(signal)
    try {
      return { value: await work(), waitedMs }
    } finally {
      this.release()
    }
  }

  stats(): AdmissionStats {
    return {
      ...this.options,
      active: this.active,
      queued: this.queue.length,
      admitted: this.counters.admitted,
      refused: { ...this.counters.refused },
      maxWaitedMs: this.counters.maxWaitedMs,
    }
  }

  private admitted(waitedMs: number): number {
    this.counters.admitted += 1
    if (waitedMs > this.counters.maxWaitedMs) this.counters.maxWaitedMs = waitedMs
    return waitedMs
  }

  private refused(reason: AdmissionRefusal): AdmissionRefused {
    this.counters.refused[reason] += 1
    return new AdmissionRefused(this.name, reason)
  }

  private acquire(signal?: AbortSignal): Promise<number> {
    if (signal?.aborted) return Promise.reject(this.refused('aborted'))

    if (this.active < this.options.limit) {
      this.active += 1
      return Promise.resolve(this.admitted(0))
    }

    if (this.queue.length >= this.options.maxQueue) {
      return Promise.reject(this.refused('queue-full'))
    }

    return new Promise<number>((resolve, reject) => {
      const enqueuedAt = this.now()
      let timer: ReturnType<typeof setTimeout> | undefined

      const leave = () => {
        const index = this.queue.indexOf(waiter)
        if (index >= 0) this.queue.splice(index, 1)
        if (timer) clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }

      const waiter: Waiter = {
        enqueuedAt,
        grant: () => {
          leave()
          resolve(this.admitted(this.now() - enqueuedAt))
        },
        refuse: (reason) => {
          leave()
          reject(this.refused(reason))
        },
      }

      const onAbort = () => waiter.refuse('aborted')

      this.queue.push(waiter)
      timer = setTimeout(() => waiter.refuse('queue-timeout'), this.options.maxWaitMs)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  private release(): void {
    const next = this.queue[0]
    // Hand the slot straight to the next waiter: `active` counts work actually
    // running, and a slot freed and retaken was never idle.
    if (next) {
      next.grant()
      return
    }
    this.active -= 1
  }
}

// ---------------------------------------------------------------------------
// The process's gates.
// ---------------------------------------------------------------------------

export type PublicWorkClass = 'assembly' | 'query'

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

/**
 * Defaults, chosen from the CAP-01 sweep (docs/capacity/STATUS.md):
 *
 * - `assembly` (curated city/neighbourhood pages): 2 at once. Throughput was
 *   the same at 2 as at 4 or 16 (~4–5/s), at half the latency of 4, and two
 *   assemblies at six reads each leave eight of Payload's 20 connections for
 *   everything else. Queue 8, wait 1.5 s: past that the answer would arrive
 *   later than a reader waits anyway.
 * - `query` (search, feeds, indexes, author pages): 8 at once, each one to
 *   three connections. Queue 32, wait 1.5 s.
 *
 * Identity, payments and editorial writes never pass through these gates.
 * Every value is an env override, because the right number belongs to the
 * platform: re-measure there and set it.
 */
function gateOptions(kind: PublicWorkClass): AdmissionOptions {
  const prefix = kind === 'assembly' ? 'PUBLIC_ASSEMBLY' : 'PUBLIC_QUERY'
  const defaults = kind === 'assembly' ? { limit: 2, maxQueue: 8 } : { limit: 8, maxQueue: 32 }
  return {
    limit: readPositiveInt(`${prefix}_CONCURRENCY`, defaults.limit),
    maxQueue: readPositiveInt(`${prefix}_QUEUE`, defaults.maxQueue),
    maxWaitMs: readPositiveInt(`${prefix}_QUEUE_MS`, 1_500),
  }
}

const globalGates = globalThis as unknown as {
  __questuraAdmissionGates?: Partial<Record<PublicWorkClass, AdmissionGate>>
}

export function admissionGate(kind: PublicWorkClass): AdmissionGate {
  const gates = (globalGates.__questuraAdmissionGates ??= {})
  return (gates[kind] ??= new AdmissionGate(kind, gateOptions(kind)))
}

export function admissionStats(): Record<PublicWorkClass, AdmissionStats> {
  return { assembly: admissionGate('assembly').stats(), query: admissionGate('query').stats() }
}

/** Test seam: forget the process's gates so options are re-read. */
export function resetAdmissionGates(): void {
  globalGates.__questuraAdmissionGates = {}
}
