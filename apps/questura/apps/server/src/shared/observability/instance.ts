import { createHash, randomUUID } from 'node:crypto'

/**
 * Who this process is, stably, for as long as it lives.
 *
 * Polling a load-balanced URL is not fleet observability. Ten samples of
 * `/api/internal/db-stats` through a load balancer can be ten samples of the
 * same instance, and the one that is saturated is the one least likely to
 * answer — so the picture is not merely incomplete, it is biased towards the
 * healthy. A collector has to be able to say "I have heard from these three
 * processes and not from that one", which needs an identity that survives
 * between samples and distinguishes two processes in the same container.
 *
 * `QUESTURA_INSTANCE_ID` is used when the platform supplies one. Otherwise a
 * random id per process, which is correct for exactly as long as the process
 * lives — restarts are supposed to look like a new instance, because they are.
 *
 * The configuration fingerprint is the other half: two instances that report
 * the same pools and different fingerprints are running different
 * configuration, which is the thing a rolling deploy makes true on purpose
 * and a broken deploy makes true by accident.
 */

const identity = globalThis as unknown as { __questuraInstance?: { id: string; startedAt: string } }

export function instanceIdentity(env: NodeJS.ProcessEnv = process.env): {
  id: string
  pid: number
  role: string
  release: string
  startedAt: string
  uptimeS: number
} {
  const self = (identity.__questuraInstance ??= {
    id: env.QUESTURA_INSTANCE_ID?.trim() || randomUUID(),
    startedAt: new Date().toISOString(),
  })

  return {
    id: self.id,
    pid: process.pid,
    role: env.APP_ROLE?.trim() || 'serving',
    release: env.QUESTURA_RELEASE_SHA?.trim() || 'dev',
    startedAt: self.startedAt,
    uptimeS: Math.round(process.uptime()),
  }
}

/**
 * A digest of the settings that decide behaviour, so two instances can be
 * compared without shipping their environment anywhere.
 *
 * Only names and values that are already safe to report: pool sizes, gate
 * limits, timeouts, fleet declarations. No URL, no secret, no credential —
 * and the fingerprint is a hash, so even a mistake in that list does not
 * become a leak.
 */
const FINGERPRINTED = [
  'DATABASE_POOL_PAYLOAD_MAX',
  'DATABASE_POOL_VISITOR_AUTH_MAX',
  'DATABASE_POOL_ADVISORY_LOCK_MAX',
  'DATABASE_MAX_CONNECTIONS',
  'DATABASE_RESERVED_CONNECTIONS',
  'DATABASE_TOPOLOGY',
  'APP_PROCESS_COUNT',
  'APP_REPLICA_COUNT',
  'APP_PROCESSES_PER_REPLICA',
  'APP_ROLLOUT_SURGE',
  'APP_JOB_PROCESS_COUNT',
  'APP_PREVIOUS_PER_PROCESS_CONNECTIONS',
  'PUBLIC_ASSEMBLY_CONCURRENCY',
  'PUBLIC_ASSEMBLY_QUEUE',
  'PUBLIC_ASSEMBLY_QUEUE_MS',
  'PUBLIC_QUERY_CONCURRENCY',
  'PUBLIC_QUERY_QUEUE',
  'PUBLIC_QUERY_QUEUE_MS',
  'PUBLIC_INGRESS_CONCURRENCY',
  'PUBLIC_INGRESS_QUEUE',
  'PUBLIC_INGRESS_QUEUE_MS',
  'PRIVATE_READ_CONCURRENCY',
  'PRIVATE_READ_QUEUE',
  'PRIVATE_READ_QUEUE_MS',
  'PG_STATEMENT_TIMEOUT_MS',
  'PG_LOCK_TIMEOUT_MS',
  'PG_IDLE_IN_TRANSACTION_TIMEOUT_MS',
  'PG_ADVISORY_LOCK_WAIT_MS',
  'REFRESH_WORKER_INTERVAL_MS',
  'REFRESH_OUTBOX',
  'TRUSTED_PROXY',
] as const

export function configFingerprint(env: NodeJS.ProcessEnv = process.env): string {
  const material = FINGERPRINTED.map((name) => `${name}=${env[name] ?? ''}`).join('\n')
  return createHash('sha256').update(material).digest('hex').slice(0, 12)
}

/**
 * A sampler that refuses to run more often than it is worth.
 *
 * `db-stats` ran a `count(*)` and a `min`/`max` over the whole search index
 * on every call. That query's cost grows with the corpus, and the moment a
 * platform polls it hardest is the moment the database is already in
 * trouble — a diagnostic that adds load during overload is a diagnostic that
 * makes the overload worse. Expensive samples are now cached and carry the
 * age of the answer, so a reader can tell current from recent.
 */
export function throttledSample<T>(key: string, ttlMs: number, sample: () => Promise<T>) {
  const store = (globalThis as unknown as { __questuraSamples?: Map<string, { at: number; value: unknown; inFlight?: Promise<unknown> }> })
  const samples = (store.__questuraSamples ??= new Map())

  return async (now: () => number = Date.now): Promise<{ value: T; ageMs: number; takenAt: string }> => {
    const existing = samples.get(key)
    if (existing && now() - existing.at < ttlMs) {
      return { value: existing.value as T, ageMs: now() - existing.at, takenAt: new Date(existing.at).toISOString() }
    }

    if (!existing?.inFlight) {
      const inFlight = sample()
        .then((value) => {
          samples.set(key, { at: now(), value })
          return value
        })
        .finally(() => {
          const entry = samples.get(key)
          if (entry) entry.inFlight = undefined
        })
      samples.set(key, { at: existing?.at ?? 0, value: existing?.value, inFlight })
    }

    const value = (await samples.get(key)!.inFlight) as T
    const entry = samples.get(key)!
    return { value, ageMs: now() - entry.at, takenAt: new Date(entry.at).toISOString() }
  }
}

/** Test seam. */
export function resetSamples(): void {
  ;(globalThis as unknown as { __questuraSamples?: Map<string, unknown> }).__questuraSamples = new Map()
}
