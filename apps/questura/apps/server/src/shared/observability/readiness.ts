/**
 * Whether this process is fit to be sent traffic.
 *
 * Boot used to log a failed database initialisation and carry on serving.
 * That is the worst of the options: the instance passes a load balancer's TCP
 * check, takes its share of readers, and answers every one of them with an
 * error — while the platform sees a healthy fleet because the other instances
 * are fine and the average looks acceptable.
 *
 * So initialisation has a state, and it starts as not ready. The process
 * keeps retrying in the background; `/api/health/ready` answers 503 until it
 * succeeds. A supervisor that prefers restarting to waiting can have that
 * instead by setting `BOOT_FAIL_FAST=1`.
 *
 * Deliberately separate from liveness. A process that is up and retrying is
 * alive and not ready, and conflating those is how a platform restarts an
 * instance that was about to recover.
 */

export type ReadinessState = {
  ready: boolean
  /** Why not, when not. */
  reason: string | null
  /** Initialisation attempts so far. */
  attempts: number
  readySince: string | null
  /** Capabilities that are degraded but not disqualifying. */
  degraded: string[]
}

const store = globalThis as unknown as { __questuraReadiness?: ReadinessState }

function state(): ReadinessState {
  return (store.__questuraReadiness ??= {
    ready: false,
    reason: 'initialising',
    attempts: 0,
    readySince: null,
    degraded: [],
  })
}

export function readinessState(): ReadinessState {
  return { ...state(), degraded: [...state().degraded] }
}

export function markReady(): void {
  const self = state()
  if (!self.ready) self.readySince = new Date().toISOString()
  self.ready = true
  self.reason = null
}

export function markNotReady(reason: string): void {
  const self = state()
  self.ready = false
  self.reason = reason
  self.readySince = null
}

export function recordInitAttempt(): number {
  const self = state()
  self.attempts += 1
  return self.attempts
}

/**
 * A capability that is not working but does not make the process unfit.
 *
 * A transient Redis failure is the example: public reads still work under
 * local limits, so restarting the whole fleet over it trades a degraded site
 * for no site. Recorded here so it is visible without being fatal.
 */
export function markDegraded(capability: string): void {
  const self = state()
  if (!self.degraded.includes(capability)) self.degraded.push(capability)
}

export function clearDegraded(capability: string): void {
  const self = state()
  self.degraded = self.degraded.filter((entry) => entry !== capability)
}

/** Test seam. */
export function resetReadiness(): void {
  store.__questuraReadiness = undefined
}

export function bootFailFast(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BOOT_FAIL_FAST === '1' || env.BOOT_FAIL_FAST === 'true'
}

/**
 * Retry an initialisation step until it succeeds, with capped backoff.
 *
 * Returns a promise that resolves on the first success. Callers do not await
 * it — the process is up and not ready while this runs.
 */
export async function retryUntilReady(
  attempt: () => Promise<void>,
  options: {
    onFailure?: (error: unknown, attempts: number) => void
    delays?: number[]
    sleep?: (ms: number) => Promise<void>
    shouldStop?: () => boolean
  } = {},
): Promise<void> {
  const delays = options.delays ?? [1_000, 2_000, 5_000, 10_000, 30_000]
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref?.()))

  for (let round = 0; ; round += 1) {
    if (options.shouldStop?.()) return

    recordInitAttempt()
    try {
      await attempt()
      markReady()
      return
    } catch (error) {
      markNotReady(error instanceof Error ? error.message : String(error))
      options.onFailure?.(error, state().attempts)
      if (bootFailFast()) throw error
      await sleep(delays[Math.min(round, delays.length - 1)]!)
    }
  }
}
