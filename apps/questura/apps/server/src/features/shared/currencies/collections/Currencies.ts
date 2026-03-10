import type { CollectionConfig } from 'payload'

const REGION_OPTIONS = [
  { label: 'North America', value: 'north-america' },
  { label: 'Central America', value: 'central-america' },
  { label: 'South America', value: 'south-america' },
  { label: 'Europe', value: 'europe' },
  { label: 'Caribbean', value: 'caribbean' },
  { label: 'Global', value: 'global' },
] as const

const STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
] as const

const RATE_PROVIDER_OPTIONS = [
  { label: 'ExchangeRate-API Open', value: 'exchange-rate-api-open' },
  { label: 'Frankfurter (Legacy)', value: 'frankfurter' },
] as const

const trimText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const normalizeUsedInRows = (value: unknown) => {
  if (!Array.isArray(value)) return []

  return value
    .map((row) => {
      const country = trimText((row as { country?: unknown } | null)?.country)
      return country ? { country } : null
    })
    .filter((row): row is { country: string } => Boolean(row))
}

const normalizeRegionValues = (value: unknown) => {
  if (!Array.isArray(value)) return []

  const allowedValues = new Set(REGION_OPTIONS.map((option) => option.value))
  return [...new Set(
    value.filter((item): item is string => (
      typeof item === 'string' && allowedValues.has(item)
    )),
  )]
}

const normalizeTimestampValue = (value: unknown): string => {
  const normalized = trimText(value)
  if (!normalized) return ''

  const timestamp = new Date(normalized)
  return Number.isNaN(timestamp.getTime()) ? '' : timestamp.toISOString()
}

const normalizeDateValue = (value: unknown): string => {
  const normalized = trimText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

const pruneEmptyLatestUsdRate = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const latestUsdRate = value as Record<string, unknown>
  const unitsPerUsd = typeof latestUsdRate.unitsPerUsd === 'number'
    && Number.isFinite(latestUsdRate.unitsPerUsd)
    && latestUsdRate.unitsPerUsd > 0
    ? latestUsdRate.unitsPerUsd
    : undefined
  const provider = ['exchange-rate-api-open', 'frankfurter'].includes(trimText(latestUsdRate.provider))
    ? trimText(latestUsdRate.provider)
    : undefined
  const providerDate = normalizeDateValue(latestUsdRate.providerDate) || undefined
  const sourceUpdatedAt = normalizeTimestampValue(latestUsdRate.sourceUpdatedAt) || undefined
  const nextUpdateAt = normalizeTimestampValue(latestUsdRate.nextUpdateAt) || undefined
  const fetchedAt = normalizeTimestampValue(latestUsdRate.fetchedAt) || undefined

  if (!unitsPerUsd && !provider && !providerDate && !sourceUpdatedAt && !nextUpdateAt && !fetchedAt) {
    return undefined
  }

  return {
    ...(unitsPerUsd ? { unitsPerUsd } : {}),
    ...(provider ? { provider } : {}),
    ...(providerDate ? { providerDate } : {}),
    ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
    ...(nextUpdateAt ? { nextUpdateAt } : {}),
    ...(fetchedAt ? { fetchedAt } : {}),
  }
}

export const Currencies: CollectionConfig = {
  slug: 'currencies',
  labels: {
    singular: 'Currency',
    plural: 'Currencies',
  },
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'name', 'displaySymbol', 'defaultLocale', 'status'],
    group: 'Travel Data',
    description: 'Reusable currency references for location money formatting and display.',
  },
  access: {
    read: () => true,
    create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'ISO 4217 currency code, for example USD or PEN.',
      },
      validate: (value: unknown) => {
        const code = trimText(value).toUpperCase()
        if (!/^[A-Z]{3}$/.test(code)) {
          return 'Currency code must be a 3-letter ISO 4217 code.'
        }
        return true
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'Human-readable currency name.',
      },
    },
    {
      name: 'symbol',
      type: 'text',
      required: true,
      admin: {
        description: 'Native or standard symbol, for example $, €, or S/.',
      },
    },
    {
      name: 'displaySymbol',
      type: 'text',
      admin: {
        description: 'Optional disambiguated label for UI, for example US$ or MX$.',
      },
    },
    {
      name: 'defaultLocale',
      type: 'text',
      required: true,
      admin: {
        description: 'Default locale for formatting with Intl.NumberFormat, for example es-PE.',
      },
      validate: (value: unknown) => {
        const locale = trimText(value)
        if (!/^[a-z]{2,3}-[A-Z]{2}$/.test(locale)) {
          return 'Use a locale like en-US or es-PE.'
        }
        return true
      },
    },
    {
      name: 'decimalPlaces',
      type: 'number',
      required: true,
      defaultValue: 2,
      min: 0,
      max: 4,
      admin: {
        description: 'Default number of decimal places for display.',
      },
    },
    {
      name: 'regions',
      type: 'select',
      hasMany: true,
      required: true,
      options: [...REGION_OPTIONS],
      admin: {
        description: 'Region tags to make the collection easier to browse and seed.',
      },
    },
    {
      name: 'usedIn',
      label: 'Used In',
      type: 'array',
      admin: {
        description: 'Countries, territories, or groups commonly using this currency.',
      },
      fields: [
        {
          name: 'country',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
      admin: {
        description: 'Optional editorial notes, pegs, volatility warnings, or usage quirks.',
        rows: 3,
      },
    },
    {
      name: 'latestUsdRate',
      label: 'Latest USD Rate',
      type: 'group',
      admin: {
        description: 'Latest stored USD conversion snapshot from the exchange-rate sync job.',
        readOnly: true,
      },
      fields: [
        {
          name: 'unitsPerUsd',
          label: 'Units Per USD',
          type: 'number',
          min: 0,
          admin: {
            description: 'Approximate number of local currency units for 1 USD.',
            step: 0.000001,
          },
        },
        {
          name: 'provider',
          type: 'select',
          options: [...RATE_PROVIDER_OPTIONS],
        },
        {
          name: 'providerDate',
          label: 'Legacy Provider Date',
          type: 'text',
          admin: {
            description: 'Legacy Frankfurter market date kept temporarily to avoid destructive schema churn.',
            readOnly: true,
            condition: () => false,
          },
          validate: (value: unknown) => {
            const normalized = trimText(value)
            if (!normalized) return true
            return /^\d{4}-\d{2}-\d{2}$/.test(normalized)
              ? true
              : 'Use a YYYY-MM-DD provider date.'
          },
        },
        {
          name: 'sourceUpdatedAt',
          label: 'Source Updated At',
          type: 'date',
          admin: {
            description: 'UTC timestamp reported by the provider for the latest published dataset.',
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
        },
        {
          name: 'nextUpdateAt',
          label: 'Next Update At',
          type: 'date',
          admin: {
            description: 'UTC timestamp for the next provider refresh window.',
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
        },
        {
          name: 'fetchedAt',
          label: 'Fetched At',
          type: 'date',
          admin: {
            description: 'UTC timestamp for when the server last fetched the provider snapshot.',
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
        },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [...STATUS_OPTIONS],
      admin: {
        position: 'sidebar',
        description: 'Archive old or deprecated currencies without deleting them.',
      },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data

        data.code = trimText(data.code).toUpperCase()
        data.name = trimText(data.name)
        data.symbol = trimText(data.symbol)
        data.displaySymbol = trimText(data.displaySymbol) || data.symbol
        data.defaultLocale = trimText(data.defaultLocale)
        data.usedIn = normalizeUsedInRows(data.usedIn)
        data.regions = normalizeRegionValues(data.regions)
        data.notes = trimText(data.notes)
        data.latestUsdRate = pruneEmptyLatestUsdRate(data.latestUsdRate)

        return data
      },
    ],
  },
}
