import type { Payload } from 'payload'

const EXCHANGE_RATE_API_OPEN_URL = 'https://open.er-api.com/v6/latest/USD'
const EXCHANGE_RATE_API_OPEN_PROVIDER = 'exchange-rate-api-open' as const
const USD_CURRENCY_CODE = 'USD'

type ActiveCurrencyDoc = {
  id: number
  code?: string | null
}

type ExchangeRateApiOpenResponse = {
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
  provider: typeof EXCHANGE_RATE_API_OPEN_PROVIDER
  sourceUpdatedAt: string
  nextUpdateAt: string
  fetchedAt: string
}

export type CurrencyExchangeRateSyncResult = {
  provider: typeof EXCHANGE_RATE_API_OPEN_PROVIDER
  baseCurrency: typeof USD_CURRENCY_CODE
  sourceUpdatedAt: string
  nextUpdateAt: string
  fetchedAt: string
  updatedCount: number
  updatedCodes: string[]
  skippedCodes: string[]
}

type FetchLike = typeof fetch

function normalizeCurrencyCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function normalizeIsoTimestamp(value: unknown): string {
  if (typeof value !== 'string') return ''
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? '' : timestamp.toISOString()
}

export function buildExchangeRateApiOpenLatestUrl(): URL {
  return new URL(EXCHANGE_RATE_API_OPEN_URL)
}

export function parseExchangeRateApiOpenResponse(
  payload: ExchangeRateApiOpenResponse,
): {
  sourceUpdatedAt: string
  nextUpdateAt: string
  rates: Map<string, number>
} {
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

async function fetchExchangeRateApiOpenUsdRates(
  fetchImpl: FetchLike,
): Promise<{
  sourceUpdatedAt: string
  nextUpdateAt: string
  rates: Map<string, number>
}> {
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

async function loadActiveCurrencies(payload: Payload): Promise<Array<{ id: number; code: string }>> {
  const docs: Array<{ id: number; code: string }> = []
  let page = 1
  let totalPages = 1

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
      sort: 'code',
      select: {
        id: true,
        code: true,
      },
    } as any)

    for (const rawDoc of (result.docs ?? []) as ActiveCurrencyDoc[]) {
      const code = normalizeCurrencyCode(rawDoc.code)
      if (typeof rawDoc.id === 'number' && code) {
        docs.push({ id: rawDoc.id, code })
      }
    }

    totalPages = typeof result.totalPages === 'number' && result.totalPages > 0
      ? result.totalPages
      : 1
    page += 1
  }

  return docs
}

async function saveLatestUsdRateSnapshot(
  payload: Payload,
  {
    currencyId,
    snapshot,
  }: {
    currencyId: number
    snapshot: LatestUsdRateSnapshot
  },
): Promise<void> {
  await payload.update({
    collection: 'currencies',
    id: currencyId,
    overrideAccess: true,
    depth: 0,
    data: {
      latestUsdRate: {
        unitsPerUsd: snapshot.unitsPerUsd,
        provider: snapshot.provider,
        providerDate: null,
        sourceUpdatedAt: snapshot.sourceUpdatedAt,
        nextUpdateAt: snapshot.nextUpdateAt,
        fetchedAt: snapshot.fetchedAt,
      },
    },
  } as any)
}

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
