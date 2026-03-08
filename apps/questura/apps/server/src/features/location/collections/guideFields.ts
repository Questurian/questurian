import type { Field, Validate } from 'payload'

const monthOptions = [
  { label: 'January', value: 'jan' },
  { label: 'February', value: 'feb' },
  { label: 'March', value: 'mar' },
  { label: 'April', value: 'apr' },
  { label: 'May', value: 'may' },
  { label: 'June', value: 'jun' },
  { label: 'July', value: 'jul' },
  { label: 'August', value: 'aug' },
  { label: 'September', value: 'sep' },
  { label: 'October', value: 'oct' },
  { label: 'November', value: 'nov' },
  { label: 'December', value: 'dec' },
] as const

const isCountryLevel = (data: unknown): boolean => (data as { level?: unknown } | null)?.level === 'country'

const isLocalLevel = (data: unknown): boolean => {
  const level = (data as { level?: unknown } | null)?.level
  return level === 'city' || level === 'neighborhood'
}

const textField = (name: string, label: string, description?: string): Field => ({
  name,
  label,
  type: 'text',
  admin: description
    ? {
        description,
      }
    : undefined,
})

const textareaField = (name: string, label: string, description?: string): Field => ({
  name,
  label,
  type: 'textarea',
  admin: description
    ? {
        description,
      }
    : undefined,
})

const numberField = (name: string, label: string, description?: string): Field => ({
  name,
  label,
  type: 'number',
  admin: description
    ? {
        description,
      }
    : undefined,
})

const buildEmergencyNumberFields = (name = 'emergencyNumbers'): Field => ({
  name,
  label: 'Emergency Numbers',
  type: 'array',
  maxRows: 12,
  fields: [
    textField('service', 'Service'),
    textField('number', 'Number'),
    textareaField('notes', 'Notes'),
  ],
})

const buildVaccinationFields = (
  name = 'vaccinations',
  includeRecommended = false
): Field => ({
  name,
  label: 'Vaccinations',
  type: 'array',
  fields: [
    textField('name', 'Name'),
    ...(includeRecommended ? [textField('recommended', 'Recommended')] : []),
    textareaField('notes', 'Notes'),
  ],
})

const extractRelationshipIds = (value: unknown): Array<string | number> => {
  const rawValues = Array.isArray(value) ? value : value ? [value] : []

  return rawValues.flatMap((item) => {
    if (typeof item === 'string' || typeof item === 'number') {
      return [item]
    }

    if (typeof item === 'object' && item !== null && 'id' in item) {
      const id = (item as { id?: unknown }).id
      if (typeof id === 'string' || typeof id === 'number') {
        return [id]
      }
    }

    return []
  })
}

const validateNeighborhoodRelationships: Validate = async (value, { req }) => {
  const ids = extractRelationshipIds(value)
  if (!ids.length) return true

  for (const id of ids) {
    const location = await req.payload.findByID({
      collection: 'locations',
      id,
      depth: 0,
      overrideAccess: true,
      select: {
        id: true,
        level: true,
      },
    })

    if (!location || location.level !== 'neighborhood') {
      return 'Related neighborhoods must reference neighborhood-level locations.'
    }
  }

  return true
}

const buildNeighborhoodReferenceField = (): Field => ({
  name: 'relatedNeighborhoods',
  label: 'Related Neighborhoods',
  type: 'relationship',
  relationTo: 'locations',
  hasMany: true,
  maxRows: 8,
  filterOptions: {
    level: {
      equals: 'neighborhood',
    },
  },
  validate: validateNeighborhoodRelationships,
  admin: {
    description: 'Optional neighborhood references for linked highlights.',
  },
})

const buildHighlightFields = (name = 'highlights'): Field => ({
  name,
  label: 'Highlights',
  type: 'array',
  maxRows: 8,
  fields: [
    textField('title', 'Title'),
    textareaField('description', 'Description'),
    buildNeighborhoodReferenceField(),
  ],
})

const buildSafetyFields = (): Field => ({
  name: 'safety',
  label: 'Safety',
  type: 'group',
  fields: [textField('status', 'Status'), textareaField('notes', 'Notes')],
})

const validateUniqueMonths: Validate = (value) => {
  if (!Array.isArray(value)) return true

  const seen = new Set<string>()

  for (const item of value) {
    const month = typeof item?.month === 'string' ? item.month : ''
    if (!month) continue

    if (seen.has(month)) {
      return 'Each month can only be used once.'
    }

    seen.add(month)
  }

  return true
}

const buildWeatherMonthlyStatsFields = (): Field => ({
  name: 'monthlyStats',
  label: 'Monthly Stats',
  type: 'array',
  maxRows: 12,
  validate: validateUniqueMonths,
  fields: [
    {
      name: 'month',
      label: 'Month',
      type: 'select',
      required: true,
      options: monthOptions,
    },
    numberField('avgHighC', 'Average High (C)'),
    numberField('avgLowC', 'Average Low (C)'),
    numberField('rainfallMm', 'Rainfall (mm)'),
    numberField('rainDays', 'Rain Days'),
    numberField('sunshineHours', 'Sunshine Hours'),
  ],
})

const buildCostsField = (): Field => ({
  name: 'costs',
  label: 'Costs',
  type: 'group',
  fields: [
    {
      name: 'items',
      label: 'Cost Items',
      type: 'array',
      maxRows: 30,
      fields: [
        textField('label', 'Label'),
        textField('amount', 'Amount'),
        textareaField('notes', 'Notes'),
      ],
    },
  ],
})

const buildUsefulAppsField = (): Field => ({
  name: 'usefulApps',
  label: 'Useful Apps',
  type: 'group',
  fields: [
    {
      name: 'apps',
      label: 'Apps',
      type: 'array',
      maxRows: 20,
      fields: [
        textField('category', 'Category'),
        textField('name', 'Name'),
        {
          name: 'logo',
          label: 'Logo',
          type: 'relationship',
          relationTo: 'media-sets',
        },
        textareaField('description', 'Description'),
        textField('url', 'URL'),
      ],
    },
  ],
})

const buildCountryDataField = (): Field => ({
  name: 'countryData',
  label: 'Country Data',
  type: 'group',
  admin: {
    condition: (data) => isCountryLevel(data),
    description: 'Country-wide facts that can be composed with local guide content.',
  },
  fields: [
    {
      name: 'currency',
      label: 'Currency',
      type: 'group',
      fields: [
        textField('code', 'Code'),
        textField('name', 'Name'),
        textField('symbol', 'Symbol'),
        textareaField('cardUsageSummary', 'Card Usage Summary'),
      ],
    },
    {
      name: 'timezone',
      label: 'Timezone',
      type: 'group',
      fields: [textField('primary', 'Primary'), textareaField('notes', 'Notes')],
    },
    buildEmergencyNumberFields(),
    buildVaccinationFields('vaccinations', true),
    {
      name: 'tapWater',
      label: 'Tap Water',
      type: 'group',
      fields: [
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { label: 'Drinkable', value: 'drinkable' },
            { label: 'Not Drinkable', value: 'not_drinkable' },
            { label: 'Varies By Region', value: 'varies_by_region' },
          ],
        },
        textareaField('notes', 'Notes'),
      ],
    },
    {
      name: 'visaPolicy',
      label: 'Visa Policy',
      type: 'group',
      fields: [
        textField('touristVisaRequired', 'Tourist Visa Required'),
        textareaField('touristVisaNotes', 'Tourist Visa Notes'),
        {
          name: 'residencyPathways',
          label: 'Residency Pathways',
          type: 'array',
          fields: [textField('type', 'Type'), textareaField('summary', 'Summary')],
        },
        textareaField('residencyNotes', 'Residency Notes'),
      ],
    },
    textareaField('entryRequirements', 'Entry Requirements'),
    textareaField('healthNotes', 'Health Notes'),
    textareaField('moneyNotes', 'Money Notes'),
  ],
})

const buildLocalSharedField = (): Field => ({
  name: 'localShared',
  label: 'Shared Overview',
  type: 'group',
  admin: {
    condition: (data) => isLocalLevel(data),
    description: 'Cross-mode practical guide data for cities and neighborhoods.',
  },
  fields: [
    textField('headline', 'Headline'),
    textareaField('subheadline', 'Subheadline'),
    {
      name: 'timezone',
      label: 'Timezone',
      type: 'group',
      fields: [textField('label', 'Label'), textareaField('notes', 'Notes')],
    },
    buildCostsField(),
    {
      name: 'healthSafety',
      label: 'Health & Safety',
      type: 'group',
      fields: [
        buildEmergencyNumberFields(),
        {
          name: 'precautions',
          label: 'Precautions',
          type: 'array',
          fields: [
            textField('label', 'Label'),
            textField('value', 'Value'),
            textareaField('notes', 'Notes'),
          ],
        },
        buildVaccinationFields(),
        textareaField('hospitalsEmbed', 'Hospitals Embed'),
        textareaField('airQualitySummary', 'Air Quality Summary'),
        {
          name: 'mustHaveItems',
          label: 'Must Have Items',
          type: 'array',
          fields: [textField('name', 'Name'), textareaField('notes', 'Notes')],
        },
      ],
    },
    {
      name: 'moneyHandling',
      label: 'Money Handling',
      type: 'group',
      fields: [
        textField('currencyDisplay', 'Currency Display'),
        textField('exchangeRateDisplay', 'Exchange Rate Display'),
        textareaField('exchangeEmbed', 'Exchange Embed'),
        textareaField('atmAvailability', 'ATM Availability'),
        textField('maxWithdrawal', 'Max Withdrawal'),
        textField('withdrawalFee', 'Withdrawal Fee'),
        textField('cardUsage', 'Card Usage'),
      ],
    },
    buildUsefulAppsField(),
    {
      name: 'weather',
      label: 'Weather',
      type: 'group',
      fields: [textareaField('summary', 'Summary'), buildWeatherMonthlyStatsFields()],
    },
    {
      name: 'localContext',
      label: 'Local Context',
      type: 'group',
      fields: [
        textField('vibe', 'Vibe'),
        textareaField('walkability', 'Walkability'),
        {
          name: 'bestFor',
          label: 'Best For',
          type: 'array',
          fields: [textField('label', 'Label')],
        },
      ],
    },
  ],
})

const buildModeFields = (name: 'explore' | 'stay' | 'move'): Field => {
  if (name === 'explore') {
    return {
      name,
      label: 'Explore',
      type: 'group',
      admin: {
        condition: (data) => isLocalLevel(data),
      },
      fields: [
        textareaField('intro', 'Intro'),
        textField('touristVisaStatus', 'Tourist Visa Status'),
        textareaField('touristVisaNotes', 'Tourist Visa Notes'),
        textField('exchangeRateInfo', 'Exchange Rate Info'),
        buildSafetyFields(),
        textField('costOfLivingSummary', 'Cost of Living Summary'),
        buildHighlightFields(),
      ],
    }
  }

  if (name === 'stay') {
    return {
      name,
      label: 'Stay',
      type: 'group',
      admin: {
        condition: (data) => isLocalLevel(data),
      },
      fields: [
        textareaField('intro', 'Intro'),
        textField('touristVisaDuration', 'Tourist Visa Duration'),
        textareaField('touristVisaExtensionNotes', 'Tourist Visa Extension Notes'),
        textareaField('timezoneOverlapNote', 'Timezone Overlap Note'),
        textField('monthlyBudgetRange', 'Monthly Budget Range'),
        textField('internetSpeed', 'Internet Speed'),
        {
          name: 'coworking',
          label: 'Coworking',
          type: 'group',
          fields: [textField('summary', 'Summary'), textareaField('notes', 'Notes')],
        },
        textField('shortTermRent', 'Short-Term Rent'),
        buildSafetyFields(),
        buildHighlightFields(),
      ],
    }
  }

  return {
    name,
    label: 'Move',
    type: 'group',
    admin: {
      condition: (data) => isLocalLevel(data),
    },
    fields: [
      textareaField('intro', 'Intro'),
      textField('residencyVisa', 'Residency Visa'),
      textareaField('residencyNotes', 'Residency Notes'),
      textField('processingTime', 'Processing Time'),
      textField('familyCostOfLivingRange', 'Family Cost of Living Range'),
      textField('propertyPricesPerSqm', 'Property Prices Per Sqm'),
      textField('incomeRequirements', 'Income Requirements'),
      textField('safestDistricts', 'Safest Districts'),
      textField('workPermits', 'Work Permits'),
      buildHighlightFields(),
    ],
  }
}

export const buildGuideField = (): Field => ({
  name: 'guide',
  label: 'Guide',
  type: 'group',
  admin: {
    description: 'Structured location guide content split by level and audience.',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Media',
          fields: [
            {
              name: 'media',
              label: 'Media',
              type: 'group',
              fields: [
                {
                  name: 'coverImage',
                  label: 'Cover Image',
                  type: 'relationship',
                  relationTo: 'media-sets',
                },
                numberField('mapCenterLat', 'Map Center Lat'),
                numberField('mapCenterLng', 'Map Center Lng'),
                numberField('mapZoom', 'Map Zoom'),
                {
                  name: 'mapBounds',
                  label: 'Map Bounds',
                  type: 'group',
                  fields: [
                    numberField('north', 'North'),
                    numberField('south', 'South'),
                    numberField('east', 'East'),
                    numberField('west', 'West'),
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Country Data',
          fields: [buildCountryDataField()],
        },
        {
          label: 'Shared Overview',
          fields: [buildLocalSharedField()],
        },
        {
          label: 'Explore',
          fields: [buildModeFields('explore')],
        },
        {
          label: 'Stay',
          fields: [buildModeFields('stay')],
        },
        {
          label: 'Move',
          fields: [buildModeFields('move')],
        },
      ],
    },
  ],
})
