/**
 * Next.js instrumentation: what this process does once, on the way up.
 *
 * The old version wrapped the whole thing in one `try/catch` that logged a
 * failed database initialisation and let the process serve anyway. That is
 * the worst available outcome: the instance passes a TCP health check, takes
 * its share of readers, and answers every one of them with an error, while
 * the fleet average looks fine. It also registered the periodic refresh drain
 * *inside* that try, so an instance that failed its first database call
 * became an instance that never drained the outbox either — for the rest of
 * its life, silently.
 *
 * Now initialisation has a state (`shared/observability/readiness.ts`). The
 * process starts not ready, retries in the background with capped backoff,
 * and registers the worker exactly once when it succeeds. `/api/health/ready`
 * answers 503 in the meantime, so a platform can hold traffic back rather
 * than send it somewhere that cannot serve it. `BOOT_FAIL_FAST=1` turns the
 * retry into a crash for supervisors that would rather restart than wait.
 *
 * What is still outside every catch: the production configuration refusal. A
 * process that is misconfigured must not boot, and must not be allowed to
 * retry its way past it.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // First, and outside everything below: this used to be swallowed by the
  // catch and the process served anyway. See shared/config/boot-guard.ts.
  const { refuseBootOnInvalidConfig } = await import('./shared/config/boot-guard')
  refuseBootOnInvalidConfig()

  const { logger } = await import('./shared/utils/logger')
  const { markNotReady, retryUntilReady } = await import('./shared/observability/readiness')

  logger.info('🚀 Server starting', {
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform,
  })

  markNotReady('initialising')

  const initialise = async () => {
    const { getPayload } = await import('payload')
    const config = await import('./payload.config')

    const payload = await getPayload({ config: config.default })

    // Cheapest possible proof that the database answers. Schema creation and
    // expensive seeds deliberately do not belong here: a serving instance's
    // boot is not the place to do work the whole fleet would repeat.
    await payload.find({ collection: 'users', limit: 1, depth: 0 })

    return payload
  }

  // Not awaited. The process is up and not ready while this runs, which is
  // exactly what readiness is for.
  void retryUntilReady(
    async () => {
      const payload = await initialise()
      await onDatabaseReady(payload, logger)
    },
    {
      onFailure: (error, attempts) => {
        logger.error('❌ Database initialisation failed; not ready', {
          attempts,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      },
    },
  ).catch((error) => {
    // Only reachable with BOOT_FAIL_FAST: let the supervisor restart us.
    logger.error('Boot failed and fail-fast is set; exiting', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exitCode = 1
  })
}

/**
 * The once-per-process work that needs a working database. Registered exactly
 * once, after the first successful initialisation — never on a retry that
 * has already succeeded, and never on a process that never got there.
 */
const started = globalThis as unknown as { __questuraStartupRegistered?: boolean }

async function onDatabaseReady(payload: unknown, logger: { info: (message: string, meta?: Record<string, unknown>) => void }) {
  if (started.__questuraStartupRegistered) return
  started.__questuraStartupRegistered = true

  logger.info('✅ Database connection established', { status: 'connected' })

  const { ensureCurrencyStartupTask } = await import('./features/shared/currencies/startup')
  const { ensureLocationStartupTask } = await import('./features/location/startup')
  const { startPeriodicDrain } = await import('./features/refresh-outbox/drain-soon')
  const { registerRefreshShutdown } = await import('./features/refresh-outbox/lifecycle')

  setTimeout(() => {
    void ensureCurrencyStartupTask(payload as never, logger as never)
    void ensureLocationStartupTask(payload as never, logger as never)
  }, 0)

  // Refresh outbox: finish work a previous process left behind, and keep
  // retrying on long-lived servers (features/refresh-outbox/drain-soon.ts).
  if (startPeriodicDrain(payload)) logger.info('Refresh outbox periodic drain started.')

  // Stop claiming on the way out, so a deploy does not leave claims that have
  // to wait out a lease before anyone else can take them.
  registerRefreshShutdown()
}
