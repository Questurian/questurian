export type ActiveCurrencyDoc = {
  id: number
  code?: string | null
}

export type ExchangeRateApiOpenResponse = {
  result?: unknown
  base_code?: unknown
  time_last_update_utc?: unknown
  time_next_update_utc?: unknown
  conversion_rates?: unknown
  base?: unknown
  rates?: unknown
}

export type LatestUsdRateSnapshot = {
  unitsPerUsd: number
  provider: 'exchange-rate-api-open'
  sourceUpdatedAt: string
  nextUpdateAt: string
  fetchedAt: string
}

export type CurrencyExchangeRateSyncResult = {
  provider: 'exchange-rate-api-open'
  baseCurrency: 'USD'
  sourceUpdatedAt: string
  nextUpdateAt: string
  fetchedAt: string
  updatedCount: number
  updatedCodes: string[]
  skippedCodes: string[]
}

export type FetchLike = typeof fetch

export type CurrencyRegion =
  | 'north-america'
  | 'central-america'
  | 'south-america'
  | 'europe'
  | 'caribbean'
  | 'global'

export type CurrencySeedRecord = {
  code: string
  name: string
  symbol: string
  displaySymbol: string
  defaultLocale: string
  decimalPlaces: number
  regions: CurrencyRegion[]
  usedIn: string[]
  notes?: string
}
