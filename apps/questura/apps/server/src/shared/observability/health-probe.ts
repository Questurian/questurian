import config from '@/payload.config'

/**
 * The database health probe, sampled.
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

async function probeDatabase(): Promise<Probe> {
  const startedAt = Date.now()
  try {
    const { getPayload } = await import('payload')
    const payload = await getPayload({ config })
    await payload.find({ collection: 'users', limit: 1, depth: 0 })
    return { at: Date.now(), ok: true, responseTimeMs: Date.now() - startedAt, error: null }
  } catch (error) {
    return {
      at: Date.now(),
      ok: false,
      responseTimeMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
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
