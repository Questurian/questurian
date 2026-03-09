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
]

const MAX_RELATED_NEIGHBORHOODS = 4

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
  if (ids.length > MAX_RELATED_NEIGHBORHOODS) {
    return `Select up to ${MAX_RELATED_NEIGHBORHOODS} related neighborhoods per highlight.`
  }

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
  maxRows: MAX_RELATED_NEIGHBORHOODS,
  filterOptions: {
    level: {
      equals: 'neighborhood',
    },
  },
  validate: validateNeighborhoodRelationships,
  admin: {
    condition: (data) => (data as { level?: unknown } | null)?.level === 'city',
    description: `Optional city neighborhood references. Select up to ${MAX_RELATED_NEIGHBORHOODS}.`,
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

const buildCoreField = (): Field => ({
  name: 'core',
  label: 'Core Guide',
  type: 'group',
  admin: {
    condition: (data) => isLocalLevel(data),
    description:
      'Primary city guide content. Neighborhood docs can fill only the fields they want to override.',
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
    buildSafetyFields(),
    {
      name: 'healthSafety',
      label: 'Health & Safety',
      type: 'group',
      fields: [buildEmergencyNumberFields()],
    },
    {
      name: 'moneyHandling',
      label: 'Money Handling',
      type: 'group',
      fields: [
        textField('exchangeRateDisplay', 'Exchange Rate Display'),
        textareaField('atmAvailability', 'ATM Availability'),
        textField('maxWithdrawal', 'Max Withdrawal'),
        textField('withdrawalFee', 'Withdrawal Fee'),
        textField('cardUsage', 'Card Usage'),
      ],
    },
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
    description: 'Structured location guide content split by media, core guide, and intent.',
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
              ],
            },
          ],
        },
        {
          label: 'Core Guide',
          admin: {
            condition: (data) => isLocalLevel(data),
          },
          fields: [buildCoreField()],
        },
        {
          label: 'Explore',
          admin: {
            condition: (data) => isLocalLevel(data),
          },
          fields: [buildModeFields('explore')],
        },
        {
          label: 'Stay',
          admin: {
            condition: (data) => isLocalLevel(data),
          },
          fields: [buildModeFields('stay')],
        },
        {
          label: 'Move',
          admin: {
            condition: (data) => isLocalLevel(data),
          },
          fields: [buildModeFields('move')],
        },
      ],
    },
  ],
})
