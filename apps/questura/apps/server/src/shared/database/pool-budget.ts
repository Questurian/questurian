import { APP_CONFIG } from '@/shared/config'

/**
 * Every Postgres connection this application can open, added up.
 *
 * Pool maxima are per process and were written down in three different files,
 * each sized sensibly on its own. Nothing multiplied them by the number of
 * processes, and Postgres does not care which pool exhausts it. Three replicas
 * of 20 + 10 + 10 is 120 connections against a default `max_connections` of
 * 100 — and the first symptom is not a slow page, it is `FATAL: sorry, too
 * many clients already` on whichever pool happens to ask next.
 *
 * A maximum is a ceiling, not a reservation: these connections are not held
 * open. The number still has to fit, because the ceiling is exactly what a
 * burst reaches.
 */

/** Payload's pool: page reads, admin writes, everything through the ORM. */
export const PAYLOAD_POOL_MAX = 20

/** Better Auth's pool: visitor sessions and accounts. */
export const VISITOR_AUTH_POOL_MAX = 10

/** The advisory-lock pool: one connection per in-flight locked operation. */
export const ADVISORY_LOCK_POOL_MAX = 10

/**
 * The schema guard's transient pool, opened at boot and closed again. It does
 * not overlap steady-state serving, but it does overlap *other processes*
 * starting at the same moment, which is exactly what a rolling restart is.
 */
export const STARTUP_POOL_MAX = 1

export type PoolBudget = {
  perProcess: number
  processCount: number
  total: number
  allowed: number
  /** True when the total cannot fit, or when nothing said what fits. */
  exceedsAllowance: boolean
}

export function poolBudget(): PoolBudget {
  const perProcess =
    PAYLOAD_POOL_MAX + VISITOR_AUTH_POOL_MAX + ADVISORY_LOCK_POOL_MAX + STARTUP_POOL_MAX
  const processCount = Math.max(1, APP_CONFIG.database.processCount)
  const total = perProcess * processCount
  const allowed = APP_CONFIG.database.maxConnections

  return {
    perProcess,
    processCount,
    total,
    allowed,
    exceedsAllowance: allowed > 0 && total > allowed,
  }
}

export function describePoolBudget(budget: PoolBudget = poolBudget()): string {
  const breakdown =
    `${PAYLOAD_POOL_MAX} payload + ${VISITOR_AUTH_POOL_MAX} visitor auth + ` +
    `${ADVISORY_LOCK_POOL_MAX} advisory locks + ${STARTUP_POOL_MAX} startup`

  return (
    `${budget.total} connections (${budget.processCount} × ${budget.perProcess}: ${breakdown})` +
    (budget.allowed > 0 ? ` against ${budget.allowed} allowed` : ', allowance not declared')
  )
}
