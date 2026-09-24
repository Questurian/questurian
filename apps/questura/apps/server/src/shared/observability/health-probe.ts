import config from '@/payload.config'

/**
 * The database health probe, sampled: `select 1` under its own short limit,
 * shared by `/api/health` and `/api/health/ready`.
 *
 * `/api/health` is the route a platform polls hardest, and it used to issue a
 * fresh query on every call from every instance. So a database under
 * pressure got a health-check storm on top of the pressure, at precisely the
 * moment it could least afford one — and during an outage each of those
 * checks waits out a connection timeout before failing, which holds a request
 * open for every poll.
 *
 * One probe at a time per process, its result reused for `PROBE_TTL_MS`.
 * Callers report the age of the answer so a reader can tell a current result
 * from a recent one.
 *
 * Lives here rather than in the route file so tests have a reset seam without
 * a route module exporting something Next does not expect.
 */

export const PROBE_TTL_MS = 2_000

/**
 * How long one probe may take before it counts as a failure.
 *
 * `select 1` takes a millisecond or two on a healthy database, so anything
 * near this means the database, or the pool in front of it, is not serving.
 * It is far shorter than the pool's own limits (`shared/database/timeouts.ts`)
 * because a health answer that arrives after the platform's check has given
 * up is no answer; the pool's limits still bound the query left behind.
 */
export const PROBE_TIMEOUT_MS = 2_000

export type Probe = {
  at: number
  ok: boolean
  responseTimeMs: number
  error: string | null
}

type Cache = { last?: Probe; inFlight?: Promise<Probe> }

const store = globalThis as unknown as { __questuraHealthProbe?: Cache }

function cache(): Cache {
  return (store.__questuraHealthProbe ??= {})
}

type Queryable = { query: (config: { text: string; query_timeout?: number }) => Promise<unknown> }

async function probeDatabase(): Promise<Probe> {
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const { getPayload } = await import('payload')
    const payload = await getPayload({ config })
    const pool = (payload.db as unknown as { pool?: Queryable }).pool
    if (!pool) throw new Error('No database pool')

    // `query_timeout` bounds the query once it has a connection; the race
    // bounds waiting for one, which the pool's connection timeout allows to
    // take longer than a probe should.
    await Promise.race([
      pool.query({ text: 'select 1', query_timeout: PROBE_TIMEOUT_MS }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Database probe timed out after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS)
      }),
    ])
    return { at: Date.now(), ok: true, responseTimeMs: Date.now() - startedAt, error: null }
  } catch (error) {
    return {
      at: Date.now(),
      ok: false,
      responseTimeMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function sampledDatabaseProbe(now: () => number = () => Date.now()): Promise<Probe> {
  const self = cache()

  const last = self.last
  if (last && now() - last.at < PROBE_TTL_MS) return last

  if (!self.inFlight) {
    self.inFlight = probeDatabase()
      .then((probe) => {
        self.last = probe
        return probe
      })
      .finally(() => {
        self.inFlight = undefined
      })
  }

  return self.inFlight
}

/** Test seam: forget the cached probe. */
export function resetHealthProbe(): void {
  store.__questuraHealthProbe = {}
}
