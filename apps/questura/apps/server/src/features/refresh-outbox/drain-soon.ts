import { logger } from '@/shared/utils/logger'

import { drainRefreshJobs, type WorkerPool } from './worker'

/**
 * Drain this process's own recent enqueues shortly after they commit.
 *
 * The enqueue runs inside the save's transaction, so the row is invisible
 * until the save commits — which is after the hook returns. A drain that ran
 * immediately would find nothing. So it runs a moment later, and once more a
 * few seconds after that for a slow commit. Anything still left (the process
 * died, the frontend was down) is the scheduled worker's
 * (`/api/internal/refresh-jobs`, `pnpm refresh:jobs drain`).
 *
 * One pending drain per process; timers are unref'd so a CLI script that
 * enqueues can still exit.
 */

const DELAYS_MS = [500, 3_000]

const state = globalThis as unknown as { __questuraRefreshDrain?: { scheduled: boolean } }

function poolFrom(payload: unknown): WorkerPool | undefined {
  return ((payload as { db?: { pool?: WorkerPool } } | undefined)?.db?.pool) ?? undefined
}

export function scheduleDrain(payload: unknown): void {
  const current = (state.__questuraRefreshDrain ??= { scheduled: false })
  if (current.scheduled) return
  const pool = poolFrom(payload)
  if (!pool) return
  current.scheduled = true

  let step = 0
  const run = () => {
    drainRefreshJobs(pool)
      .catch((error) => {
        logger.warn('Refresh outbox drain failed; the scheduled worker will retry', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        step += 1
        if (step < DELAYS_MS.length) {
          setTimeout(run, DELAYS_MS[step]! - DELAYS_MS[step - 1]!).unref?.()
        } else {
          current.scheduled = false
        }
      })
  }
  setTimeout(run, DELAYS_MS[0]).unref?.()
}

/**
 * A periodic drain for long-lived servers, so retries and anything left by a
 * crashed process are picked up without an external scheduler. Default every
 * 60 s in production; `REFRESH_WORKER_INTERVAL_MS=0` turns it off. On a
 * serverless platform instances do not live long enough for this to be the
 * guarantee — there, a scheduler must call `POST /api/internal/refresh-jobs`
 * (docs/serverless-launch-checklist.md).
 */
export function startPeriodicDrain(payload: unknown, env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.REFRESH_WORKER_INTERVAL_MS
  const interval = raw === undefined || raw === '' ? (env.NODE_ENV === 'production' ? 60_000 : 0) : Number(raw)
  if (!Number.isFinite(interval) || interval <= 0) return false

  const pool = poolFrom(payload)
  if (!pool) return false

  const timers = globalThis as unknown as { __questuraRefreshInterval?: ReturnType<typeof setInterval> }
  if (timers.__questuraRefreshInterval) return true

  // First pass soon after boot: whatever the previous process left behind.
  setTimeout(() => scheduleDrain(payload), 5_000).unref?.()
  timers.__questuraRefreshInterval = setInterval(() => scheduleDrain(payload), interval)
  timers.__questuraRefreshInterval.unref?.()
  return true
}
