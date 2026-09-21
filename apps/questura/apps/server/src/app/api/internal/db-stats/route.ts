import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { describePoolBudget, poolBudget } from '@/shared/database/pool-budget'
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

    // Every backend this database has, not just this process's pools: the
    // budget is a property of the database, and other replicas count.
    const activity = pool
      ? await pool.query(`
          SELECT state, count(*)::int AS connections
          FROM pg_stat_activity
          WHERE datname = current_database()
          GROUP BY state
          ORDER BY state;
        `)
      : { rows: [] }

    const searchIndex = pool
      ? await pool.query(`
          SELECT
            count(*)::int AS rows,
            max(indexed_at) AS newest,
            min(indexed_at) AS oldest
          FROM public_search_documents;
        `).catch(() => ({ rows: [{ rows: null, newest: null, oldest: null }] }))
      : { rows: [] }

    const budget = poolBudget()

    return NextResponse.json(
      {
        takenAt: new Date().toISOString(),
        releaseSha: process.env.QUESTURA_RELEASE_SHA || 'unknown',
        payloadPool: {
          total: pool?.totalCount ?? 0,
          idle: pool?.idleCount ?? 0,
          // Requests queueing here are waiting for a connection, not for the
          // database. Sustained above zero means the pool is the bottleneck.
          waiting: pool?.waitingCount ?? 0,
        },
        advisoryLockPool: advisoryLockPoolStats(),
        budget: { ...budget, description: describePoolBudget(budget) },
        timeouts: {
          serving: servingTimeouts(),
          advisoryLock: advisoryLockTimeouts(),
        },
        backendsByState: activity.rows,
        searchIndex: searchIndex.rows[0] ?? null,
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
