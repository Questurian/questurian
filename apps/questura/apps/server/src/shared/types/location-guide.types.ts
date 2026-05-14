export type LocationLevel = 'country' | 'city' | 'neighborhood'

type PlainObject = Record<string, unknown>

export type LocationGuideRecord = {
  media?: PlainObject | null
  core?: PlainObject | null
  explore?: PlainObject | null
  stay?: PlainObject | null
  move?: PlainObject | null
}

export type ResolvedCurrencyMeta = {
  id: number
  code: string
  name: string
  symbol: string
  displaySymbol: string
  defaultLocale: string
  decimalPlaces: number
  latestUsdRate?: {
    unitsPerUsd: number | null
    provider: string | null
    sourceUpdatedAt: string | null
    nextUpdateAt: string | null
    fetchedAt: string | null
  } | null
}
