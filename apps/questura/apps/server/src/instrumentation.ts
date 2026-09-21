/**
 * Next.js Instrumentation
 *
 * Runs once when the server starts
 * Used for startup logging and initialization
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // First, and outside the catch below: that catch used to swallow the
    // production config refusal thrown from Payload's onInit, and the process
    // served anyway. See shared/config/boot-guard.ts.
    const { refuseBootOnInvalidConfig } = await import('./shared/config/boot-guard')
    refuseBootOnInvalidConfig()

    const { logger } = await import('./shared/utils/logger')
    const { ensureCurrencyStartupTask } = await import('./features/shared/currencies/startup')
    const { ensureLocationStartupTask } = await import('./features/location/startup')

    logger.info('🚀 Server starting', {
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform,
    })

    // Check database connection
    try {
      const { getPayload } = await import('payload')
      const config = await import('./payload.config')

      const payload = await getPayload({ config: config.default })

      // Simple query to verify DB is responsive
      await payload.find({
        collection: 'users',
        limit: 1,
        depth: 0,
      })

      logger.info('✅ Database connection established', {
        status: 'connected',
      })

      setTimeout(() => {
        void ensureCurrencyStartupTask(payload, logger)
        void ensureLocationStartupTask(payload, logger)
      }, 0)

      // Refresh outbox: finish work a previous process left behind, and keep
      // retrying on long-lived servers (features/refresh-outbox/drain-soon.ts).
      const { startPeriodicDrain } = await import('./features/refresh-outbox/drain-soon')
      if (startPeriodicDrain(payload)) logger.info('Refresh outbox periodic drain started.')
    } catch (error) {
      logger.error('❌ Database connection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
