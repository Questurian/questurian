import type { Payload } from 'payload'

import type { LoggerLike } from '@/types'

import { syncCurrencyUsdRates } from './exchange-rates'
import { seedCurrencies } from './seed'

const CURRENCY_STARTUP_TASK_KEY = '__questuraCurrencyStartupTask'

/** Rates younger than this are left alone at boot. */
export const STARTUP_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type CurrencyStartupPolicy = {
  /** Seed an empty table. Development only: production seeds at deploy. */
  seedIfEmpty: boolean
  /** When to call the rates API at boot. */
  sync: 'always' | 'if-stale' | 'off'
}

/**
 * What a booting process may do about currencies.
 *
 * Every production start used to seed (if empty) and call the exchange-rate
 * API and rewrite every currency row. On one long-lived host that is once a
 * deploy. On a serverless platform every cold instance is a boot: a burst
 * that starts twenty instances makes twenty API calls and twenty rounds of
 * writes, at the moment the database is busiest. Measured locally: each of
 * this session's production restarts re-synced all 23 rows.
 *
 * Production now seeds nowhere near boot (`pnpm bootstrap:currencies` at
 * deploy) and syncs at boot only when the newest rate is over a day old; the
 * regular refresh belongs to a scheduler calling
 * `POST /api/internal/exchange-rates/sync`. `CURRENCY_STARTUP_SYNC` overrides
 * (`always`, `if-stale`, `off`). Development keeps the old behaviour.
 */
export function currencyStartupPolicy(env: Record<string, string | undefined> = process.env): CurrencyStartupPolicy {
  const production = env.NODE_ENV === 'production'
  const override = env.CURRENCY_STARTUP_SYNC
  const sync =
    override === 'always' || override === 'if-stale' || override === 'off'
      ? override
      : production
        ? 'if-stale'
        : 'always'
  return { seedIfEmpty: !production, sync }
}

async function newestRateAgeMs(payload: Payload): Promise<number | null> {
  const result = await payload.find({
    collection: 'currencies',
    limit: 1,
    depth: 0,
    sort: '-updatedAt',
    overrideAccess: true,
  } as any)
  const updatedAt = (result.docs?.[0] as { updatedAt?: string } | undefined)?.updatedAt
  return updatedAt ? Date.now() - new Date(updatedAt).getTime() : null
}

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

  const policy = currencyStartupPolicy()

  const task = (async () => {
    try {
      const currencyCount = await countCurrencies(payload)
      if (currencyCount === 0) {
        if (!policy.seedIfEmpty) {
          logger.warn('No currencies found. Production does not seed at boot: run `pnpm bootstrap:currencies`.')
          return
        }
        logger.info('No currencies found. Seeding currencies in background.')
        await seedCurrencies(payload)
      } else {
        logger.info('Currencies already present. Skipping seed.', {
          currencyCount,
        })
      }

      if (policy.sync === 'off') return
      if (policy.sync === 'if-stale') {
        const age = await newestRateAgeMs(payload)
        if (age !== null && age < STARTUP_SYNC_MAX_AGE_MS) {
          logger.info('Exchange rates are fresh. Skipping boot sync.', { ageMinutes: Math.round(age / 60000) })
          return
        }
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
