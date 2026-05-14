import type {
  ExchangeRateApiOpenResponse,
  FetchLike,
} from '../types'

import {
  EXCHANGE_RATE_API_OPEN_URL,
  USD_CURRENCY_CODE,
} from './constants'
import {
  normalizeCurrencyCode,
  normalizeIsoTimestamp,
} from './normalizers'

export type ExchangeRateApiOpenUsdRates = {
  sourceUpdatedAt: string
  nextUpdateAt: string
  rates: Map<string, number>
}

export function buildExchangeRateApiOpenLatestUrl(): URL {
  return new URL(EXCHANGE_RATE_API_OPEN_URL)
}

export function parseExchangeRateApiOpenResponse(
  payload: ExchangeRateApiOpenResponse,
): ExchangeRateApiOpenUsdRates {
  if (normalizeCurrencyCode(payload.result) && normalizeCurrencyCode(payload.result) !== 'SUCCESS') {
    throw new Error('ExchangeRate-API open response was not successful.')
  }

  const baseCode = normalizeCurrencyCode(payload.base_code ?? payload.base)
  if (baseCode !== USD_CURRENCY_CODE) {
    throw new Error('ExchangeRate-API open response did not use USD as the base currency.')
  }

  const sourceUpdatedAt = normalizeIsoTimestamp(payload.time_last_update_utc)
  if (!sourceUpdatedAt) {
    throw new Error('ExchangeRate-API open response was missing a valid source update timestamp.')
  }

  const nextUpdateAt = normalizeIsoTimestamp(payload.time_next_update_utc)
  if (!nextUpdateAt) {
    throw new Error('ExchangeRate-API open response was missing a valid next update timestamp.')
  }

  const rawRates = payload.conversion_rates ?? payload.rates
  if (!rawRates || typeof rawRates !== 'object' || Array.isArray(rawRates)) {
    throw new Error('ExchangeRate-API open response was missing a conversion rates map.')
  }

  const rates = new Map<string, number>()

  for (const [rawCode, rawValue] of Object.entries(rawRates)) {
    const code = normalizeCurrencyCode(rawCode)
    if (!code) continue
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue <= 0) continue
    rates.set(code, rawValue)
  }

  return {
    sourceUpdatedAt,
    nextUpdateAt,
    rates,
  }
}

export async function fetchExchangeRateApiOpenUsdRates(
  fetchImpl: FetchLike,
): Promise<ExchangeRateApiOpenUsdRates> {
  const url = buildExchangeRateApiOpenLatestUrl()
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`ExchangeRate-API open sync failed with status ${response.status}.`)
  }

  const payload = await response.json() as ExchangeRateApiOpenResponse
  return parseExchangeRateApiOpenResponse(payload)
}
