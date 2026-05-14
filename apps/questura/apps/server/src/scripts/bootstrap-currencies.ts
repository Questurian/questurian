import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { seedCurrencies } from '../features/shared/currencies/seed'
import { syncCurrencyUsdRates } from '../features/shared/currencies/exchange-rates'

async function countCurrencies(payload: Awaited<ReturnType<typeof getPayload>>): Promise<number> {
  const result = await payload.find({
    collection: 'currencies',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as any)

  return typeof result.totalDocs === 'number' ? result.totalDocs : result.docs?.length ?? 0
}

async function countCurrenciesWithStoredRates(
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<number> {
  let page = 1
  let totalPages = 1
  let storedRateCount = 0

  while (page <= totalPages) {
    const result = await payload.find({
      collection: 'currencies',
      limit: 200,
      page,
      depth: 0,
      overrideAccess: true,
      where: {
        status: {
          equals: 'active',
        },
      },
      select: {
        latestUsdRate: true,
      },
    } as any)

    const docs = Array.isArray(result.docs) ? result.docs : []
    storedRateCount += docs.reduce((count, rawDoc) => {
      const latestUsdRate = (rawDoc as { latestUsdRate?: { unitsPerUsd?: unknown } | null }).latestUsdRate
      const unitsPerUsd = latestUsdRate?.unitsPerUsd
      return typeof unitsPerUsd === 'number' && Number.isFinite(unitsPerUsd) && unitsPerUsd > 0
        ? count + 1
        : count
    }, 0)

    totalPages = typeof result.totalPages === 'number' && result.totalPages > 0
      ? result.totalPages
      : 1
    page += 1
  }

  return storedRateCount
}

const run = async () => {
  const payload = await getPayload({ config: await config })

  try {
    console.log('Bootstrapping currencies before server start...\n')
    await seedCurrencies(payload)
    const currencyCount = await countCurrencies(payload)
    if (currencyCount === 0) {
      throw new Error('Currency bootstrap failed because no currencies exist after seeding.')
    }

    const storedRateCountBeforeSync = await countCurrenciesWithStoredRates(payload)
    const syncResult = await syncCurrencyUsdRates(payload)
    if (syncResult.updatedCount === 0 && storedRateCountBeforeSync === 0) {
      throw new Error('Exchange-rate sync returned no stored rates for active currencies.')
    }

    console.log(
      `\nCurrency bootstrap complete: ${syncResult.updatedCount} rates updated.`,
    )
    console.log(`Updated codes: ${syncResult.updatedCodes.join(', ') || 'none'}`)
    console.log(`Skipped codes: ${syncResult.skippedCodes.join(', ') || 'none'}`)
    console.log(`Source updated: ${syncResult.sourceUpdatedAt}`)
    console.log(`Next update: ${syncResult.nextUpdateAt}`)
  } catch (error) {
    try {
      const storedRateCount = await countCurrenciesWithStoredRates(payload)
      const message = error instanceof Error ? error.message : String(error)

      if (storedRateCount > 0) {
        console.warn(`Currency bootstrap refresh failed; continuing with cached stored rates. ${message}`)
        process.exitCode = 0
        return
      }

      console.error(`Currency bootstrap failed and no stored rates are available. ${message}`)
      process.exitCode = 1
      return
    } catch (nestedError) {
      const message = nestedError instanceof Error ? nestedError.message : String(nestedError)
      console.error(`Currency bootstrap failed before startup could verify stored rates. ${message}`)
      process.exitCode = 1
      return
    }
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
