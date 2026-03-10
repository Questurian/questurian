/**
 * Next.js Instrumentation
 *
 * Runs once when the server starts
 * Used for startup logging and initialization
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logger } = await import('./shared/utils/logger')
    const { ensureCurrencyStartupTask } = await import('./features/shared/currencies/startup')

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
      }, 0)
    } catch (error) {
      logger.error('❌ Database connection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
