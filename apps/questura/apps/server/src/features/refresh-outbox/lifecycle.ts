import { logger } from '@/shared/utils/logger'

import { drainRefreshJobs, stopClaimingRefreshJobs, type DrainResult, type WorkerPool } from './worker'

/**
 * One drain at a time in this process, and a record of how the last one went.
 *
 * There are four ways a drain starts: the timer after an enqueue commits, the
 * periodic timer, `POST /api/internal/refresh-jobs`, and `pnpm refresh:jobs`.
 * Only the first two knew about each other, through a boolean in
 * `drain-soon.ts`. So a scheduler calling the endpoint every minute while the
 * periodic timer also ran gave one process two concurrent drains, each
 * claiming its own batch and each opening its own connections — the declared
 * concurrency doubled without anything declaring it.
 *
 * Cross-process coordination is the claim's job (`worker.ts`): two processes
 * draining at once is fine and expected. This is only about one process not
 * quietly running two.
 *
 * The health record exists because counters alone cannot tell "nothing to do"
 * from "nothing has run". A backlog with a worker that last succeeded an hour
 * ago is a different incident from the same backlog with a worker succeeding
 * every minute, and `pending: 400` looks identical in both.
 */

export type WorkerHealth = {
  /** A drain is running in this process right now. */
  draining: boolean
  /** ISO time of the last drain that finished without throwing. */
  lastSuccessAt: string | null
  /** ISO time of the last drain that threw. */
  lastFailureAt: string | null
  lastError: string | null
  lastResult: DrainResult | null
  /** Drains started in this process since it booted. */
  runs: number
  /** Drains that were skipped because one was already running. */
  skippedConcurrent: number
  /** Whether this process is still willing to claim work. */
  claiming: boolean
}

type State = {
  inFlight: Promise<DrainResult> | null
  health: WorkerHealth
}

const state = (globalThis as unknown as { __questuraRefreshLifecycle?: State })
const initial = (): State => ({
  inFlight: null,
  health: {
    draining: false,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    lastResult: null,
    runs: 0,
    skippedConcurrent: 0,
    claiming: true,
  },
})

function current(): State {
  return (state.__questuraRefreshLifecycle ??= initial())
}

export function workerHealth(): WorkerHealth {
  return { ...current().health }
}

/** Test seam: forget this process's drain history. */
export function resetWorkerLifecycle(): void {
  state.__questuraRefreshLifecycle = initial()
}

export type RunDrainOptions = Parameters<typeof drainRefreshJobs>[1] & {
  /**
   * Wait for a drain already in flight instead of returning its result
   * immediately. The HTTP endpoint wants this: a scheduler that gets an
   * instant answer while work is still running cannot tell the difference
   * between "done" and "somebody else is doing it".
   */
  joinInFlight?: boolean
}

/**
 * Run a drain unless this process is already running one.
 *
 * Returns the in-flight drain's result rather than starting a second, so
 * every caller gets a truthful answer about work that actually happened.
 */
export async function runDrain(pool: WorkerPool, options: RunDrainOptions = {}): Promise<DrainResult> {
  const self = current()

  if (self.inFlight) {
    self.health.skippedConcurrent += 1
    return self.inFlight
  }

  self.health.runs += 1
  self.health.draining = true

  const run = drainRefreshJobs(pool, options)
    .then((result) => {
      self.health.lastSuccessAt = new Date().toISOString()
      self.health.lastResult = result
      self.health.lastError = null
      return result
    })
    .catch((error) => {
      self.health.lastFailureAt = new Date().toISOString()
      self.health.lastError = error instanceof Error ? error.message : String(error)
      throw error
    })
    .finally(() => {
      self.inFlight = null
      self.health.draining = false
    })

  self.inFlight = run
  return run
}

/**
 * Stop claiming and let what is in flight finish.
 *
 * Deliberately additive to the framework's own signal handling: this adds a
 * listener, it does not replace one, and it never calls `process.exit`.
 * Anything still claimed when the process goes keeps its lease and is
 * reclaimed by another worker when that lease expires — which is the same
 * path a crash takes, so there is only one recovery story to trust.
 */
export async function shutdownRefreshWorker(graceMs = 10_000): Promise<void> {
  stopClaimingRefreshJobs()
  current().health.claiming = false

  const inFlight = current().inFlight
  if (!inFlight) return

  await Promise.race([
    inFlight.catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, graceMs)),
  ])
}

const signals = globalThis as unknown as { __questuraRefreshSignals?: boolean }

export function registerRefreshShutdown(): void {
  if (signals.__questuraRefreshSignals) return
  signals.__questuraRefreshSignals = true

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void shutdownRefreshWorker().then(() => {
        logger.info('Refresh worker stopped claiming', { signal, health: workerHealth() })
      })
    })
  }
}
