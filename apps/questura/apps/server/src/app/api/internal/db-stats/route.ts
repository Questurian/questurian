import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { workerHealth } from '@/features/refresh-outbox/lifecycle'
import { refreshJobStats } from '@/features/refresh-outbox/worker'
import { describePoolBudget, poolBudget } from '@/shared/database/pool-budget'
import { admissionStats } from '@/shared/http/admission'
import { redisBreaker } from '@/shared/lib/rate-limit-counter'
import { configFingerprint, instanceIdentity, throttledSample } from '@/shared/observability/instance'
import { readinessState } from '@/shared/observability/readiness'
import { servingTimeouts, advisoryLockTimeouts } from '@/shared/database/timeouts'
import { advisoryLockPoolStats } from '@/shared/utils/advisory-lock'

/**
 * GET /api/internal/db-stats
 *
 * What the database side of this process is doing: pool occupancy, the
 * connection budget, the statement budgets actually in force, and how fresh
 * the search index is.
 *
 * The audit could not say whether four concurrent homepage requests saturated
 * the pool, because nothing reported pool occupancy. `waiting` above zero is
 * the answer to that question, and it is the number to watch under load: it
 * means requests are queueing for a connection rather than for the database.
 *
 * Secret-gated rather than public. None of this is dangerous to know, but it
 * describes capacity, and capacity is what someone probing for a limit wants.
 * Same shape as the exchange-rate sync route: `Authorization: Bearer <secret>`
 * or `x-stats-secret`, compared through equal-length digests.
 *
 * **Per instance, and it says so.** Polling a load-balanced URL is not fleet
 * observability: ten samples can be ten samples of the same process, and the
 * saturated one is the least likely to answer — so the picture is biased
 * towards the healthy rather than merely incomplete. Every response now names
 * the instance, its role, its release and a fingerprint of the settings that
 * decide its behaviour, so a collector can say which processes it has heard
 * from and whether they are running the same configuration.
 *
 * **Cheap counters are separated from expensive diagnostics.** Pool
 * occupancy, gate state and worker health are process memory and are always
 * current. The database-wide queries — `pg_stat_activity` and the search
 * index — are sampled and carry the age of their answer, because their cost
 * grows with the corpus and the moment a platform polls hardest is the moment
 * the database is already in trouble. A diagnostic that adds load during
 * overload makes the overload worse.
 */

function secretsMatch(provided: string, configured: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest()
  const configuredDigest = createHash('sha256').update(configured).digest()
  return timingSafeEqual(providedDigest, configuredDigest)
}

function providedSecret(req: NextRequest): string {
  const bearer = req.headers.get('authorization')
  if (typeof bearer === 'string' && bearer.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim()
  }

  return req.headers.get('x-stats-secret')?.trim() ?? ''
}

/**
 * How stale a database-wide answer may be. Long enough that per-second
 * polling from a collector cannot turn into per-second `pg_stat_activity`
 * scans; short enough to watch a burst.
 */
const DB_WIDE_SAMPLE_MS = 2_000
/** The search index count grows with the corpus, so it is sampled harder. */
const SEARCH_INDEX_SAMPLE_MS = 30_000

type PoolLike = {
  totalCount?: number
  idleCount?: number
  waitingCount?: number
  query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>
}

export async function GET(req: NextRequest) {
  const configured = process.env.DB_STATS_SECRET?.trim()
  if (!configured) {
    return NextResponse.json(
      { message: 'DB_STATS_SECRET is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (!secretsMatch(providedSecret(req), configured)) {
    return NextResponse.json(
      { message: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const payload = await getPayload({ config })
    const pool = (payload.db as { pool?: PoolLike }).pool

    // Database-wide, so throttled: every backend this database has, not just
    // this process's pools. The budget is a property of the database and
    // other replicas count — but this is also the query that costs the most
    // exactly when it is asked the most.
    const activitySample = throttledSample('pg_stat_activity', DB_WIDE_SAMPLE_MS, async () =>
      pool
        ? (
            await pool.query(`
              SELECT state, count(*)::int AS connections
              FROM pg_stat_activity
              WHERE datname = current_database()
              GROUP BY state
              ORDER BY state;
            `)
          ).rows
        : [],
    )

    // Grows with the corpus. Sampled for the same reason, and more so.
    const searchSample = throttledSample('search_index', SEARCH_INDEX_SAMPLE_MS, async () =>
      pool
        ? (
            await pool
              .query(`
                SELECT
                  count(*)::int AS rows,
                  max(indexed_at) AS newest,
                  min(indexed_at) AS oldest
                FROM public_search_documents;
              `)
              .catch(() => ({ rows: [{ rows: null, newest: null, oldest: null }] }))
          ).rows[0] ?? null
        : null,
    )

    // Imported lazily: `better-auth.ts` refuses to load without DATABASE_URI,
    // and a diagnostics route should not be the thing that makes a process
    // fail to answer.
    const sessionPool = await import('@/features/visitor-auth/lib/better-auth')
      .then((module) => module.visitorAuthPool as { totalCount?: number; idleCount?: number; waitingCount?: number })
      .catch(() => null)

    const budget = poolBudget()
    const [activity, searchIndex, outbox] = await Promise.all([
      activitySample(),
      searchSample(),
      pool ? refreshJobStats(pool as never).catch(() => null) : Promise.resolve(null),
    ])

    return NextResponse.json(
      {
        takenAt: new Date().toISOString(),
        // Which process answered. Without this, ten samples through a load
        // balancer may be ten samples of one instance.
        instance: instanceIdentity(),
        configFingerprint: configFingerprint(),
        releaseSha: process.env.QUESTURA_RELEASE_SHA || 'unknown',
        readiness: readinessState(),
        payloadPool: {
          total: pool?.totalCount ?? 0,
          idle: pool?.idleCount ?? 0,
          // Requests queueing here are waiting for a connection, not for the
          // database. Sustained above zero means the pool is the bottleneck.
          waiting: pool?.waitingCount ?? 0,
        },
        // The session pool was missing entirely, so a saturated Better Auth
        // pool looked like a healthy process.
        visitorAuthPool: sessionPool
          ? {
              total: sessionPool.totalCount ?? 0,
              idle: sessionPool.idleCount ?? 0,
              waiting: sessionPool.waitingCount ?? 0,
            }
          : null,
        advisoryLockPool: advisoryLockPoolStats(),
        budget: { ...budget, description: describePoolBudget(budget) },
        // Expensive public work admitted, queued and refused in this process.
        // `refused` climbing means the gate is shedding load; `queued` pinned
        // at its maximum means it is about to.
        admission: admissionStats(),
        // Whether a dependency outage is currently being paid for in waiting.
        redis: redisBreaker.stats(),
        refresh: { worker: workerHealth(), backlog: outbox },
        timeouts: {
          serving: servingTimeouts(),
          advisoryLock: advisoryLockTimeouts(),
        },
        backendsByState: activity.value,
        backendsSampledAt: activity.takenAt,
        backendsAgeMs: activity.ageMs,
        searchIndex: searchIndex.value,
        searchIndexSampledAt: searchIndex.takenAt,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to read database stats.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
