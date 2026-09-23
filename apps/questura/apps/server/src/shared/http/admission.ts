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

export type PublicWorkClass = 'assembly' | 'query' | 'ingress' | 'private' | 'credential' | 'staff' | 'auth'

/**
 * A whole number at or above `min`, or the default.
 *
 * The queue may be zero — "refuse rather than wait" is a real policy — so a
 * declared `0` is honoured there. Concurrency and wait may not: a gate that
 * admits nothing, or a wait of nothing, is a typo, not a policy. An invalid
 * value keeps the default here so a pool is never built from `NaN`, and
 * `fleet-manifest.ts` reports it, which production turns into a refused boot.
 */
function readGateInt(name: string, fallback: number, min: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  if (!/^\d+$/.test(raw)) return fallback
  const value = Number(raw)
  return value >= min ? value : fallback
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
 * - `ingress` (every public read, before anything slow): 64 at once. This one
 *   is not about the database. The assembly and query gates sit *after* the
 *   rate limiter, which is a Redis call — so when Redis is slow or
 *   half-open, every arriving request waits on it and nothing bounds how many
 *   of those there are. Commands have deadlines, but a deadline caps one
 *   command, not the number of requests holding one. The ingress gate is the
 *   thing that can say no while the dependency behind it is still deciding.
 *   It is deliberately generous: it exists to stop unbounded growth, not to
 *   shape traffic. It also covers `navigation`, which had no gate at all.
 * - `private` (every session-bearing account route: identity, bookmark refs,
 *   list and writes, the member body): 16 at once, so session traffic has a
 *   budget of its own and cannot be starved by a public burst or starve it.
 *   A caller with no session cookie never reaches this gate — it does no
 *   database or Redis work and must stay free (`private-route.ts`).
 * - `credential`, `staff`: verifying a credential presented to Payload's
 *   mounts, and verified staff/service reads of them (`mount-bounds.ts`).
 * - `auth`: Better Auth's routes and set-password — password hashing.
 *
 * Payments and editorial writes never pass through any of these. Every value
 * is an env override, because the right number belongs to the platform:
 * re-measure there and set it.
 */
export const GATE_DEFAULTS: Record<
  PublicWorkClass,
  { prefix: string; what: string; limit: number; maxQueue: number; maxWaitMs: number }
> = {
  assembly: { prefix: 'PUBLIC_ASSEMBLY', what: 'curated page assembly', limit: 2, maxQueue: 8, maxWaitMs: 1_500 },
  query: { prefix: 'PUBLIC_QUERY', what: 'public queries', limit: 8, maxQueue: 32, maxWaitMs: 1_500 },
  ingress: { prefix: 'PUBLIC_INGRESS', what: 'public ingress', limit: 64, maxQueue: 128, maxWaitMs: 1_000 },
  private: { prefix: 'PRIVATE_READ', what: 'signed-in reads', limit: 16, maxQueue: 64, maxWaitMs: 1_500 },
  // Proving who a Payload-mount caller is. An API key is one indexed query and
  // a JWT is CPU; either way a flood of made-up credentials is bounded here
  // and cannot take the public query gate's slots (mount-bounds.ts).
  credential: { prefix: 'MOUNT_CREDENTIAL', what: 'credential checks', limit: 8, maxQueue: 32, maxWaitMs: 1_000 },
  // Verified staff and service reads of the Payload mount. Generous — the
  // writer and Location Manager read up to 200 rows at depth 2 — but finite:
  // a valid key is not a licence for unbounded work.
  staff: { prefix: 'MOUNT_STAFF', what: 'staff and service reads', limit: 16, maxQueue: 64, maxWaitMs: 5_000 },
  // Better Auth's own routes and set-password: sign-in and sign-up hash a
  // password (scrypt — tens of milliseconds of CPU each), callbacks write
  // sessions and profiles. Few at once, a patient queue: a person signing in
  // waits longer than a page reader will, and a refusal here is a failed
  // sign-in, so the queue is long and the wait is long. Four at once keeps
  // these plus the private gate's session lookups near Better Auth's
  // ten-connection pool rather than far past it.
  auth: { prefix: 'VISITOR_AUTH', what: 'sign-in and account writes', limit: 4, maxQueue: 64, maxWaitMs: 3_000 },
}

export function gateOptions(kind: PublicWorkClass): AdmissionOptions {
  const defaults = GATE_DEFAULTS[kind]
  return {
    limit: readGateInt(`${defaults.prefix}_CONCURRENCY`, defaults.limit, 1),
    maxQueue: readGateInt(`${defaults.prefix}_QUEUE`, defaults.maxQueue, 0),
    maxWaitMs: readGateInt(`${defaults.prefix}_QUEUE_MS`, defaults.maxWaitMs, 1),
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
  const kinds = Object.keys(GATE_DEFAULTS) as PublicWorkClass[]
  return Object.fromEntries(kinds.map((kind) => [kind, admissionGate(kind).stats()])) as Record<
    PublicWorkClass,
    AdmissionStats
  >
}

/** Test seam: forget the process's gates so options are re-read. */
export function resetAdmissionGates(): void {
  globalGates.__questuraAdmissionGates = {}
}
