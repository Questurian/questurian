import type { Payload } from 'payload'

import type { LoggerLike } from '@/types'

import { syncCurrencyUsdRates } from './exchange-rates'
import { seedCurrencies } from './seed'

const CURRENCY_STARTUP_TASK_KEY = '__questuraCurrencyStartupTask'

async function countCurrencies(payload: Payload): Promise<number> {
  const result = await payload.find({
    collection: 'currencies',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as any)

  return typeof result.totalDocs === 'number' ? result.totalDocs : result.docs?.length ?? 0
}

export function ensureCurrencyStartupTask(
  payload: Payload,
  logger: LoggerLike,
): Promise<void> {
  const globalScope = globalThis as typeof globalThis & {
    [CURRENCY_STARTUP_TASK_KEY]?: Promise<void>
  }

  if (globalScope[CURRENCY_STARTUP_TASK_KEY]) {
    return globalScope[CURRENCY_STARTUP_TASK_KEY]!
  }

  const task = (async () => {
    try {
      const currencyCount = await countCurrencies(payload)
      if (currencyCount === 0) {
        logger.info('No currencies found. Seeding currencies in background.')
        await seedCurrencies(payload)
      } else {
        logger.info('Currencies already present. Skipping seed.', {
          currencyCount,
        })
      }

      logger.info('Starting background exchange-rate sync.')
      const result = await syncCurrencyUsdRates(payload)
      logger.info('Background exchange-rate sync complete.', {
        updatedCount: result.updatedCount,
        updatedCodes: result.updatedCodes,
        skippedCodes: result.skippedCodes,
        sourceUpdatedAt: result.sourceUpdatedAt,
        nextUpdateAt: result.nextUpdateAt,
      })
    } catch (error) {
      logger.warn('Background currency initialization failed.', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })()

  globalScope[CURRENCY_STARTUP_TASK_KEY] = task
  return task
}
