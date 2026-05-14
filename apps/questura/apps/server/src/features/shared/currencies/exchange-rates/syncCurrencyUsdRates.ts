import type { Payload } from 'payload'

import type {
  CurrencyExchangeRateSyncResult,
  FetchLike,
} from '../types'

import {
  EXCHANGE_RATE_API_OPEN_PROVIDER,
  USD_CURRENCY_CODE,
} from './constants'
import { fetchExchangeRateApiOpenUsdRates } from './provider'
import {
  loadActiveCurrencies,
  saveLatestUsdRateSnapshot,
} from './repository'

export async function syncCurrencyUsdRates(
  payload: Payload,
  {
    fetchImpl = fetch,
    now = new Date(),
  }: {
    fetchImpl?: FetchLike
    now?: Date
  } = {},
): Promise<CurrencyExchangeRateSyncResult> {
  const currencies = await loadActiveCurrencies(payload)
  const fetchedAt = now.toISOString()

  if (currencies.length === 0) {
    return {
      provider: EXCHANGE_RATE_API_OPEN_PROVIDER,
      baseCurrency: USD_CURRENCY_CODE,
      sourceUpdatedAt: fetchedAt,
      nextUpdateAt: fetchedAt,
      fetchedAt,
      updatedCount: 0,
      updatedCodes: [],
      skippedCodes: [],
    }
  }

  const { sourceUpdatedAt, nextUpdateAt, rates } = await fetchExchangeRateApiOpenUsdRates(fetchImpl)
  rates.set(USD_CURRENCY_CODE, 1)

  const updatedCodes: string[] = []
  const skippedCodes: string[] = []

  for (const currency of currencies) {
    const unitsPerUsd = rates.get(currency.code)

    if (typeof unitsPerUsd !== 'number' || !Number.isFinite(unitsPerUsd) || unitsPerUsd <= 0) {
      skippedCodes.push(currency.code)
      continue
    }

    await saveLatestUsdRateSnapshot(payload, {
      currencyId: currency.id,
      snapshot: {
        unitsPerUsd,
        provider: EXCHANGE_RATE_API_OPEN_PROVIDER,
        sourceUpdatedAt,
        nextUpdateAt,
        fetchedAt,
      },
    })
    updatedCodes.push(currency.code)
  }

  return {
    provider: EXCHANGE_RATE_API_OPEN_PROVIDER,
    baseCurrency: USD_CURRENCY_CODE,
    sourceUpdatedAt,
    nextUpdateAt,
    fetchedAt,
    updatedCount: updatedCodes.length,
    updatedCodes,
    skippedCodes,
  }
}
