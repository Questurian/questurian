import { DEFAULT_EDITOR_ASSIST_MODEL } from '../staging/api'
import type {
  CountryDataDraft,
  HighlightDraft,
  LocationDocumentDraft,
  LocationFieldDefinition,
  LocationGuideDraft,
  LocationIndexRow,
  LocationLevel,
  LocationOption,
  LocationSectionDefinition,
  MediaDraft,
  PayloadLocationBody,
  PayloadLocationDoc,
  PayloadRelationship,
  PayloadRelationshipList,
  ScalarFieldDefinition,
  WeatherMonth,
} from './types'
import {
  cloneValue,
  createDefaultObjectFromFields,
  getValueAtPath,
  mergeDefinedValues,
  pruneEmptyValues,
  setValueAtPath,
} from './utils'

export const LOCATION_LEVEL_OPTIONS: Array<{ value: LocationLevel; label: string }> = [
  { value: 'country', label: 'Country' },
  { value: 'city', label: 'City' },
  { value: 'neighborhood', label: 'Neighborhood' },
]

export const MONTH_OPTIONS = [
  { value: 'jan', label: 'January' },
  { value: 'feb', label: 'February' },
  { value: 'mar', label: 'March' },
  { value: 'apr', label: 'April' },
  { value: 'may', label: 'May' },
  { value: 'jun', label: 'June' },
  { value: 'jul', label: 'July' },
  { value: 'aug', label: 'August' },
  { value: 'sep', label: 'September' },
  { value: 'oct', label: 'October' },
  { value: 'nov', label: 'November' },
  { value: 'dec', label: 'December' },
] as const

function coerceWeatherMonth(value: string): WeatherMonth | '' {
  return MONTH_OPTIONS.some((option) => option.value === value)
    ? value as WeatherMonth
    : ''
}

export const TAP_WATER_STATUS_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: 'drinkable', label: 'Drinkable' },
  { value: 'not_drinkable', label: 'Not Drinkable' },
  { value: 'varies_by_region', label: 'Varies by Region' },
] as const

const isLocalLevel = (draft: LocationDocumentDraft): boolean => draft.level === 'city' || draft.level === 'neighborhood'
const isNeighborhoodLevel = (draft: LocationDocumentDraft): boolean => draft.level === 'neighborhood'

function scalarField(
  key: string,
  label: string,
  type: ScalarFieldDefinition['type'],
  config: Partial<Omit<ScalarFieldDefinition, 'key' | 'label' | 'type'>> = {},
): ScalarFieldDefinition {
  return {
    key,
    label,
    type,
    ...config,
  }
}

function textField(
  key: string,
  label: string,
  config: Partial<Omit<ScalarFieldDefinition, 'key' | 'label' | 'type'>> = {},
): ScalarFieldDefinition {
  return scalarField(key, label, 'text', config)
}

function textareaField(
  key: string,
  label: string,
  config: Partial<Omit<ScalarFieldDefinition, 'key' | 'label' | 'type'>> = {},
): ScalarFieldDefinition {
  return scalarField(key, label, 'textarea', config)
}

function numberField(
  key: string,
  label: string,
  config: Partial<Omit<ScalarFieldDefinition, 'key' | 'label' | 'type'>> = {},
): ScalarFieldDefinition {
  return scalarField(key, label, 'number', config)
}

function selectField(
  key: string,
  label: string,
  options: Array<{ value: string; label: string }>,
  config: Partial<Omit<ScalarFieldDefinition, 'key' | 'label' | 'type' | 'options'>> = {},
): ScalarFieldDefinition {
  return scalarField(key, label, 'select', {
    ...config,
    options,
  })
}

function groupField(
  key: string,
  label: string,
  fields: LocationFieldDefinition[],
  description?: string,
): LocationFieldDefinition {
  return {
    key,
    label,
    type: 'group',
    description,
    fields,
  }
}

function arrayField(
  key: string,
  label: string,
  fields: LocationFieldDefinition[],
  config: Partial<Extract<LocationFieldDefinition, { type: 'array' }>> = {},
): LocationFieldDefinition {
  return {
    key,
    label,
    type: 'array',
    fields,
    ...config,
  }
}

function relationshipField(
  key: string,
  label: string,
  relationTo: 'locations' | 'media-sets',
  optionSource: 'locations' | 'neighborhoods' | 'mediaSets',
  config: Partial<Extract<LocationFieldDefinition, { type: 'relationship' }>> = {},
): LocationFieldDefinition {
  return {
    key,
    label,
    type: 'relationship',
    relationTo,
    optionSource,
    ...config,
  }
}

const emergencyNumberFields: LocationFieldDefinition[] = [
  textField('service', 'Service'),
  textField('number', 'Number'),
  textareaField('notes', 'Notes'),
]

const highlightFields: LocationFieldDefinition[] = [
  textField('title', 'Title'),
  textareaField('description', 'Description'),
  relationshipField('relatedNeighborhoods', 'Related Neighborhoods', 'locations', 'neighborhoods', {
    hasMany: true,
    hintKey: 'relatedNeighborhoodKeys',
    hintLabel: 'AI locationKey hints',
  }),
]

const locationSections: LocationSectionDefinition[] = [
  {
    id: 'hierarchy',
    label: 'Hierarchy',
    description: 'Location level, key segments, and display names. Payload derives locationKey and parentKey from these fields.',
    levels: ['country', 'city', 'neighborhood'],
    path: [],
    fields: [
      selectField('level', 'Level', LOCATION_LEVEL_OPTIONS),
      textField('country', 'Country Key', {
        description: 'Normalized key.',
        width: 'half',
      }),
      textField('countryName', 'Country Name', {
        description: 'Display label.',
        width: 'half',
      }),
      textField('city', 'City Key', {
        description: 'Normalized key.',
        visibleWhen: isLocalLevel,
        width: 'half',
      }),
      textField('cityName', 'City Name', {
        description: 'Display label.',
        visibleWhen: isLocalLevel,
        width: 'half',
      }),
      textField('neighborhood', 'Neighborhood Key', {
        description: 'Normalized key.',
        visibleWhen: isNeighborhoodLevel,
        width: 'half',
      }),
      textField('neighborhoodName', 'Neighborhood Name', {
        description: 'Display label.',
        visibleWhen: isNeighborhoodLevel,
        width: 'half',
      }),
    ],
  },
  {
    id: 'media',
    label: 'Media',
    description: 'Media metadata for the location guide.',
    levels: ['country', 'city', 'neighborhood'],
    path: ['guide', 'media'],
    aiPath: 'guide.media',
    fields: [
      relationshipField('coverImage', 'Cover Image', 'media-sets', 'mediaSets', {
        picker: 'mediaSetLibrary',
      }),
    ],
  },
  {
    id: 'countryData',
    label: 'Country Data',
    description: 'Country-wide facts that can later be composed with city and neighborhood guides.',
    levels: ['country'],
    path: ['guide', 'countryData'],
    aiPath: 'guide.countryData',
    fields: [
      groupField('currency', 'Currency', [
        textField('code', 'Code', { aiEnabled: true }),
        textField('name', 'Name', { aiEnabled: true }),
        textField('symbol', 'Symbol', { aiEnabled: true }),
        textareaField('cardUsageSummary', 'Card Usage Summary', { aiEnabled: true }),
      ]),
      groupField('timezone', 'Timezone', [
        textField('primary', 'Primary', { aiEnabled: true }),
        textareaField('notes', 'Notes', { aiEnabled: true }),
      ]),
      arrayField('emergencyNumbers', 'Emergency Numbers', emergencyNumberFields, {
        addLabel: 'Add emergency number',
        maxRows: 12,
      }),
      groupField('tapWater', 'Tap Water', [
        selectField('status', 'Status', [...TAP_WATER_STATUS_OPTIONS]),
        textareaField('notes', 'Notes'),
      ]),
      groupField('visaPolicy', 'Visa Policy', [
        textField('touristVisaRequired', 'Tourist Visa Required'),
        textareaField('touristVisaNotes', 'Tourist Visa Notes'),
        arrayField('residencyPathways', 'Residency Pathways', [
          textField('type', 'Type'),
          textareaField('summary', 'Summary'),
        ], {
          addLabel: 'Add residency pathway',
        }),
        textareaField('residencyNotes', 'Residency Notes'),
      ]),
      textareaField('entryRequirements', 'Entry Requirements', { aiEnabled: true }),
      textareaField('healthNotes', 'Health Notes', { aiEnabled: true }),
      textareaField('moneyNotes', 'Money Notes', { aiEnabled: true }),
    ],
  },
  {
    id: 'localShared',
    label: 'Shared Overview',
    description: 'Cross-mode practical information shared by the explore, stay, and move experiences.',
    levels: ['city', 'neighborhood'],
    path: ['guide', 'localShared'],
    aiPath: 'guide.localShared',
    fields: [
      textField('headline', 'Headline', { aiEnabled: true }),
      textareaField('subheadline', 'Subheadline', { aiEnabled: true }),
      groupField('timezone', 'Timezone', [
        textField('label', 'Label', { aiEnabled: true }),
        textareaField('notes', 'Notes', { aiEnabled: true }),
      ]),
      groupField('healthSafety', 'Health & Safety', [
        arrayField('emergencyNumbers', 'Emergency Numbers', emergencyNumberFields, {
          addLabel: 'Add emergency number',
          maxRows: 12,
          aiEnabled: true,
        }),
      ]),
      groupField('moneyHandling', 'Money Handling', [
        textField('currencyDisplay', 'Currency Display', { aiEnabled: true }),
        textField('exchangeRateDisplay', 'Exchange Rate Display', { aiEnabled: true }),
        textareaField('atmAvailability', 'ATM Availability', { aiEnabled: true }),
        textField('maxWithdrawal', 'Max Withdrawal', { aiEnabled: true }),
        textField('withdrawalFee', 'Withdrawal Fee', { aiEnabled: true }),
        textField('cardUsage', 'Card Usage', { aiEnabled: true }),
      ]),
      groupField('weather', 'Weather', [
        textareaField('summary', 'Summary', { aiEnabled: true }),
        arrayField('monthlyStats', 'Monthly Stats', [
          selectField('month', 'Month', [...MONTH_OPTIONS]),
          numberField('avgHighC', 'Average High (C)'),
          numberField('avgLowC', 'Average Low (C)'),
          numberField('rainfallMm', 'Rainfall (mm)'),
          numberField('rainDays', 'Rain Days'),
          numberField('sunshineHours', 'Sunshine Hours'),
        ], {
          addLabel: 'Add month',
          maxRows: 12,
        }),
      ]),
      groupField('localContext', 'Local Context', [
        textField('vibe', 'Vibe', { aiEnabled: true }),
        textareaField('walkability', 'Walkability', { aiEnabled: true }),
      ]),
    ],
  },
  {
    id: 'explore',
    label: 'Explore',
    description: 'Tourist framing, safety context, and explore-specific highlights.',
    levels: ['city', 'neighborhood'],
    path: ['guide', 'explore'],
    aiPath: 'guide.explore',
    fields: [
      textareaField('intro', 'Intro', { aiEnabled: true }),
      textField('touristVisaStatus', 'Tourist Visa Status', { aiEnabled: true }),
      textareaField('touristVisaNotes', 'Tourist Visa Notes', { aiEnabled: true }),
      textField('exchangeRateInfo', 'Exchange Rate Info', { aiEnabled: true }),
      groupField('safety', 'Safety', [
        textField('status', 'Status', { aiEnabled: true }),
        textareaField('notes', 'Notes', { aiEnabled: true }),
      ]),
      textField('costOfLivingSummary', 'Cost of Living Summary', { aiEnabled: true }),
      arrayField('highlights', 'Highlights', highlightFields, {
        addLabel: 'Add highlight',
        maxRows: 8,
      }),
    ],
  },
  {
    id: 'stay',
    label: 'Stay',
    description: 'Digital nomad guidance, rental context, and medium-term stay highlights.',
    levels: ['city', 'neighborhood'],
    path: ['guide', 'stay'],
    aiPath: 'guide.stay',
    fields: [
      textareaField('intro', 'Intro', { aiEnabled: true }),
      textField('touristVisaDuration', 'Tourist Visa Duration', { aiEnabled: true }),
      textareaField('touristVisaExtensionNotes', 'Tourist Visa Extension Notes', { aiEnabled: true }),
      textareaField('timezoneOverlapNote', 'Timezone Overlap Note', { aiEnabled: true }),
      textField('monthlyBudgetRange', 'Monthly Budget Range', { aiEnabled: true }),
      textField('internetSpeed', 'Internet Speed', { aiEnabled: true }),
      groupField('coworking', 'Coworking', [
        textField('summary', 'Summary', { aiEnabled: true }),
        textareaField('notes', 'Notes', { aiEnabled: true }),
      ]),
      textField('shortTermRent', 'Short-Term Rent', { aiEnabled: true }),
      groupField('safety', 'Safety', [
        textField('status', 'Status', { aiEnabled: true }),
        textareaField('notes', 'Notes', { aiEnabled: true }),
      ]),
      arrayField('highlights', 'Highlights', highlightFields, {
        addLabel: 'Add highlight',
        maxRows: 8,
      }),
    ],
  },
  {
    id: 'move',
    label: 'Move',
    description: 'Relocation-focused content for long-term residents, families, and work moves.',
    levels: ['city', 'neighborhood'],
    path: ['guide', 'move'],
    aiPath: 'guide.move',
    fields: [
      textareaField('intro', 'Intro', { aiEnabled: true }),
      textField('residencyVisa', 'Residency Visa', { aiEnabled: true }),
      textareaField('residencyNotes', 'Residency Notes', { aiEnabled: true }),
      textField('processingTime', 'Processing Time', { aiEnabled: true }),
      textField('familyCostOfLivingRange', 'Family Cost of Living Range', { aiEnabled: true }),
      textField('propertyPricesPerSqm', 'Property Prices Per Sqm', { aiEnabled: true }),
      textField('incomeRequirements', 'Income Requirements', { aiEnabled: true }),
      textField('safestDistricts', 'Safest Districts', { aiEnabled: true }),
      textField('workPermits', 'Work Permits', { aiEnabled: true }),
      arrayField('highlights', 'Highlights', highlightFields, {
        addLabel: 'Add highlight',
        maxRows: 8,
      }),
    ],
  },
]

export const LOCATION_SECTION_DEFINITIONS = locationSections

export const LOCATION_INDEX_SELECT_FIELDS = [
  'level',
  'country',
  'city',
  'neighborhood',
  'countryName',
  'cityName',
  'neighborhoodName',
  'locationKey',
  'parentKey',
  'updatedAt',
] as const

export const MEDIA_SET_SELECT_FIELDS = ['title', 'alt_text', 'location'] as const

export const FIELD_AI_PATHS = [
  'countryName',
  'cityName',
  'neighborhoodName',
  'guide.countryData.currency.code',
  'guide.countryData.currency.name',
  'guide.countryData.currency.symbol',
  'guide.countryData.currency.cardUsageSummary',
  'guide.countryData.timezone.primary',
  'guide.countryData.timezone.notes',
  'guide.countryData.entryRequirements',
  'guide.countryData.healthNotes',
  'guide.countryData.moneyNotes',
  'guide.localShared.headline',
  'guide.localShared.subheadline',
  'guide.localShared.timezone.label',
  'guide.localShared.timezone.notes',
  'guide.localShared.moneyHandling.currencyDisplay',
  'guide.localShared.moneyHandling.exchangeRateDisplay',
  'guide.localShared.moneyHandling.atmAvailability',
  'guide.localShared.moneyHandling.maxWithdrawal',
  'guide.localShared.moneyHandling.withdrawalFee',
  'guide.localShared.moneyHandling.cardUsage',
  'guide.localShared.weather.summary',
  'guide.localShared.localContext.vibe',
  'guide.localShared.localContext.walkability',
  'guide.explore.intro',
  'guide.explore.touristVisaStatus',
  'guide.explore.touristVisaNotes',
  'guide.explore.exchangeRateInfo',
  'guide.explore.safety.status',
  'guide.explore.safety.notes',
  'guide.explore.costOfLivingSummary',
  'guide.stay.intro',
  'guide.stay.touristVisaDuration',
  'guide.stay.touristVisaExtensionNotes',
  'guide.stay.timezoneOverlapNote',
  'guide.stay.monthlyBudgetRange',
  'guide.stay.internetSpeed',
  'guide.stay.coworking.summary',
  'guide.stay.coworking.notes',
  'guide.stay.shortTermRent',
  'guide.stay.safety.status',
  'guide.stay.safety.notes',
  'guide.move.intro',
  'guide.move.residencyVisa',
  'guide.move.residencyNotes',
  'guide.move.processingTime',
  'guide.move.familyCostOfLivingRange',
  'guide.move.propertyPricesPerSqm',
  'guide.move.incomeRequirements',
  'guide.move.safestDistricts',
  'guide.move.workPermits',
] as const

function createEmptyMediaDraft(): MediaDraft {
  return {
    coverImage: null,
  }
}

function createEmptyCountryDataDraft(): CountryDataDraft {
  return {
    currency: {
      code: '',
      name: '',
      symbol: '',
      cardUsageSummary: '',
    },
    timezone: {
      primary: '',
      notes: '',
    },
    emergencyNumbers: [],
    tapWater: {
      status: '',
      notes: '',
    },
    visaPolicy: {
      touristVisaRequired: '',
      touristVisaNotes: '',
      residencyPathways: [],
      residencyNotes: '',
    },
    entryRequirements: '',
    healthNotes: '',
    moneyNotes: '',
  }
}

function createEmptyLocalSharedDraft(): LocationGuideDraft['localShared'] {
  return {
    headline: '',
    subheadline: '',
    timezone: {
      label: '',
      notes: '',
    },
    healthSafety: {
      emergencyNumbers: [],
    },
    moneyHandling: {
      currencyDisplay: '',
      exchangeRateDisplay: '',
      atmAvailability: '',
      maxWithdrawal: '',
      withdrawalFee: '',
      cardUsage: '',
    },
    weather: {
      summary: '',
      monthlyStats: [],
    },
    localContext: {
      vibe: '',
      walkability: '',
    },
  }
}

function createEmptyExploreDraft(): LocationGuideDraft['explore'] {
  return {
    intro: '',
    touristVisaStatus: '',
    touristVisaNotes: '',
    exchangeRateInfo: '',
    safety: {
      status: '',
      notes: '',
    },
    costOfLivingSummary: '',
    highlights: [],
  }
}

function createEmptyStayDraft(): LocationGuideDraft['stay'] {
  return {
    intro: '',
    touristVisaDuration: '',
    touristVisaExtensionNotes: '',
    timezoneOverlapNote: '',
    monthlyBudgetRange: '',
    internetSpeed: '',
    coworking: {
      summary: '',
      notes: '',
    },
    shortTermRent: '',
    safety: {
      status: '',
      notes: '',
    },
    highlights: [],
  }
}

function createEmptyMoveDraft(): LocationGuideDraft['move'] {
  return {
    intro: '',
    residencyVisa: '',
    residencyNotes: '',
    processingTime: '',
    familyCostOfLivingRange: '',
    propertyPricesPerSqm: '',
    incomeRequirements: '',
    safestDistricts: '',
    workPermits: '',
    highlights: [],
  }
}

export function createEmptyLocationDraft(): LocationDocumentDraft {
  return {
    draftId: `location_${Date.now()}`,
    editorModelName: DEFAULT_EDITOR_ASSIST_MODEL,
    updatedAt: new Date().toISOString(),
    aiSourceNotes: '',
    level: 'country',
    country: '',
    city: '',
    neighborhood: '',
    countryName: '',
    cityName: '',
    neighborhoodName: '',
    guide: {
      media: createEmptyMediaDraft(),
      countryData: createEmptyCountryDataDraft(),
      localShared: createEmptyLocalSharedDraft(),
      explore: createEmptyExploreDraft(),
      stay: createEmptyStayDraft(),
      move: createEmptyMoveDraft(),
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeFieldValue(
  field: LocationFieldDefinition,
  rawValue: unknown,
): unknown {
  if (field.type === 'group') {
    const source = isRecord(rawValue) ? rawValue : {}
    const next = createDefaultObjectFromFields(field.fields)
    for (const childField of field.fields) {
      next[childField.key] = sanitizeFieldValue(
        childField,
        source[childField.key],
      )
    }
    return next
  }

  if (field.type === 'array') {
    if (!Array.isArray(rawValue)) return []
    return rawValue.map((rowValue) => {
      const source = isRecord(rowValue) ? rowValue : {}
      const next = createDefaultObjectFromFields(field.fields)
      for (const childField of field.fields) {
        next[childField.key] = sanitizeFieldValue(
          childField,
          source[childField.key],
        )
      }
      return next
    })
  }

  if (field.type === 'relationship') {
    if (field.hasMany) {
      if (!Array.isArray(rawValue)) return []
      return rawValue
        .map((value) => extractRelationshipId(value as PayloadRelationship))
        .filter((value): value is number => value !== null)
    }

    return extractRelationshipId(rawValue as PayloadRelationship)
  }

  if (field.type === 'number') {
    return typeof rawValue === 'number' && Number.isFinite(rawValue)
      ? rawValue
      : null
  }

  if (field.type === 'select') {
    if (typeof rawValue !== 'string') return ''
    if (!field.options?.some((option) => option.value === rawValue)) return ''
    return rawValue
  }

  return typeof rawValue === 'string' ? rawValue : ''
}

function applySanitizedFields(
  draft: LocationDocumentDraft,
  source: Record<string, unknown>,
  basePath: string[],
  fields: LocationFieldDefinition[],
): LocationDocumentDraft {
  let nextDraft = draft
  for (const field of fields) {
    const path = [...basePath, field.key]
    const rawValue = getValueAtPath(source, path)
    const sanitizedValue = sanitizeFieldValue(field, rawValue)
    nextDraft = setValueAtPath(nextDraft, path, sanitizedValue)
  }
  return nextDraft
}

export function sanitizeLocationDraftShape(input: unknown): LocationDocumentDraft {
  const nextDraft = createEmptyLocationDraft()
  if (!isRecord(input)) return nextDraft

  let sanitized = cloneValue(nextDraft)

  for (const section of LOCATION_SECTION_DEFINITIONS) {
    sanitized = applySanitizedFields(sanitized, input, section.path, section.fields)
  }

  if (typeof input.draftId === 'string' && input.draftId.trim()) {
    sanitized.draftId = input.draftId
  }

  if (typeof input.payloadId === 'number' && Number.isFinite(input.payloadId)) {
    sanitized.payloadId = input.payloadId
  } else {
    sanitized.payloadId = undefined
  }

  if (typeof input.editorModelName === 'string' && input.editorModelName.trim()) {
    sanitized.editorModelName = input.editorModelName as LocationDocumentDraft['editorModelName']
  }

  if (typeof input.aiSourceNotes === 'string') {
    sanitized.aiSourceNotes = input.aiSourceNotes
  }

  if (typeof input.updatedAt === 'string' && input.updatedAt.trim()) {
    sanitized.updatedAt = input.updatedAt
  }

  return sanitized
}

export function getVisibleSections(level: LocationLevel): LocationSectionDefinition[] {
  return LOCATION_SECTION_DEFINITIONS.filter((section) => section.levels.includes(level))
}

export const getVisibleLocationSections = getVisibleSections
export const createEmptyLocationDocumentDraft = createEmptyLocationDraft

export function deriveLocationPreview(
  draft: Pick<LocationDocumentDraft, 'level' | 'country' | 'city' | 'neighborhood'>,
): {
  locationKey: string
  parentKey: string
} {
  return {
    locationKey: buildLocationKeyPreview(draft),
    parentKey: buildParentKeyPreview(draft),
  }
}

export function buildLocationSchemaContract(): string {
  const contract = {
    collection: 'locations',
    levels: {
      country: ['hierarchy', 'media', 'countryData'],
      city: ['hierarchy', 'media', 'localShared', 'explore', 'stay', 'move'],
      neighborhood: ['hierarchy', 'media', 'localShared', 'explore', 'stay', 'move'],
    },
    sections: LOCATION_SECTION_DEFINITIONS.map((section) => ({
      id: section.id,
      label: section.label,
      levels: section.levels,
      path: section.id === 'hierarchy' ? 'identity' : section.aiPath || section.path.join('.'),
      fields: section.fields,
    })),
    aiFieldPaths: [...FIELD_AI_PATHS],
    relationshipHints: {
      neighborhoods: [
        'guide.explore.highlights[].relatedNeighborhoodKeys',
        'guide.stay.highlights[].relatedNeighborhoodKeys',
        'guide.move.highlights[].relatedNeighborhoodKeys',
      ],
    },
    rules: [
      'Return JSON only with no markdown or commentary.',
      'Only include fields valid for the selected location level.',
      'Do not invent Payload IDs for relationships.',
      'Use relationship hint fields when you know a locationKey but not an ID.',
      'Leave unknown values empty instead of fabricating facts.',
    ],
  }

  return JSON.stringify(contract, null, 2)
}

export function isFieldAiPathSupported(path: string): boolean {
  return FIELD_AI_PATHS.includes(path as (typeof FIELD_AI_PATHS)[number])
}

export function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatFallbackName(value: string): string {
  if (!value) return ''

  return value
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function resolveHierarchyTitlePart(nameValue: string, keyValue: string): string {
  const name = nameValue.trim()
  if (name) return name

  const normalizedKey = normalizeKeyPart(keyValue)
  if (!normalizedKey) return ''
  return formatFallbackName(normalizedKey)
}

export function buildLocationHierarchyTitle(
  draft: Pick<
    LocationDocumentDraft,
    'level' | 'country' | 'city' | 'neighborhood' | 'countryName' | 'cityName' | 'neighborhoodName'
  >,
): string {
  const country = resolveHierarchyTitlePart(draft.countryName, draft.country)
  const city = resolveHierarchyTitlePart(draft.cityName, draft.city)
  const neighborhood = resolveHierarchyTitlePart(
    draft.neighborhoodName,
    draft.neighborhood,
  )

  if (draft.level === 'country') {
    return country
  }

  if (draft.level === 'city') {
    return [city, country].filter(Boolean).join(', ')
  }

  return [neighborhood, city, country].filter(Boolean).join(', ')
}

export function buildLocationKeyPreview(draft: Pick<LocationDocumentDraft, 'level' | 'country' | 'city' | 'neighborhood'>): string {
  const country = normalizeKeyPart(draft.country)
  const city = normalizeKeyPart(draft.city)
  const neighborhood = normalizeKeyPart(draft.neighborhood)

  if (!country) return ''
  if (draft.level === 'country') return country
  if (draft.level === 'city') return city ? `${country}|${city}` : country
  if (!city) return country
  return neighborhood ? `${country}|${city}|${neighborhood}` : `${country}|${city}`
}

export function buildParentKeyPreview(draft: Pick<LocationDocumentDraft, 'level' | 'country' | 'city'>): string {
  const country = normalizeKeyPart(draft.country)
  const city = normalizeKeyPart(draft.city)

  if (!country) return ''
  if (draft.level === 'country') return ''
  if (draft.level === 'city') return country
  return city ? `${country}|${city}` : country
}

export function resolveLocationDraftRef(
  draft: Pick<LocationDocumentDraft, 'payloadId' | 'level' | 'country' | 'city' | 'neighborhood'>,
  locationOptions: LocationOption[],
): number | null {
  if (typeof draft.payloadId === 'number' && Number.isFinite(draft.payloadId)) {
    return draft.payloadId
  }

  const locationKey = buildLocationKeyPreview(draft)
  if (!locationKey) return null

  const normalizedLocationKey = locationKey.trim().toLowerCase()
  const match = locationOptions.find((location) => (
    location.level === draft.level
      && location.locationKey.trim().toLowerCase() === normalizedLocationKey
  ))

  return match?.id ?? null
}

function extractRelationshipId(value: PayloadRelationship): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof value.id === 'number') return value.id
  return null
}

function extractRelationshipIds(value: PayloadRelationshipList): number[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    const id = extractRelationshipId(entry)
    return id === null ? [] : [id]
  })
}

function trimText(value: string | null | undefined): string {
  return typeof value === 'string' ? value : ''
}

function valueOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function payloadLocationToDraft(doc: PayloadLocationDoc): LocationDocumentDraft {
  const draft = createEmptyLocationDraft()

  const next: LocationDocumentDraft = {
    ...draft,
    payloadId: doc.id,
    level: doc.level,
    country: trimText(doc.country),
    city: trimText(doc.city),
    neighborhood: trimText(doc.neighborhood),
    countryName: trimText(doc.countryName),
    cityName: trimText(doc.cityName),
    neighborhoodName: trimText(doc.neighborhoodName),
    updatedAt: doc.updatedAt || new Date().toISOString(),
  }

  next.guide.media = {
    coverImage: extractRelationshipId(doc.guide?.media?.coverImage),
  }

  next.guide.countryData = {
    currency: {
      code: trimText(doc.guide?.countryData?.currency?.code),
      name: trimText(doc.guide?.countryData?.currency?.name),
      symbol: trimText(doc.guide?.countryData?.currency?.symbol),
      cardUsageSummary: trimText(doc.guide?.countryData?.currency?.cardUsageSummary),
    },
    timezone: {
      primary: trimText(doc.guide?.countryData?.timezone?.primary),
      notes: trimText(doc.guide?.countryData?.timezone?.notes),
    },
    emergencyNumbers: (doc.guide?.countryData?.emergencyNumbers || []).map((row) => ({
      service: trimText(row.service),
      number: trimText(row.number),
      notes: trimText(row.notes),
    })),
    tapWater: {
      status: doc.guide?.countryData?.tapWater?.status || '',
      notes: trimText(doc.guide?.countryData?.tapWater?.notes),
    },
    visaPolicy: {
      touristVisaRequired: trimText(doc.guide?.countryData?.visaPolicy?.touristVisaRequired),
      touristVisaNotes: trimText(doc.guide?.countryData?.visaPolicy?.touristVisaNotes),
      residencyPathways: (doc.guide?.countryData?.visaPolicy?.residencyPathways || []).map((row) => ({
        type: trimText(row.type),
        summary: trimText(row.summary),
      })),
      residencyNotes: trimText(doc.guide?.countryData?.visaPolicy?.residencyNotes),
    },
    entryRequirements: trimText(doc.guide?.countryData?.entryRequirements),
    healthNotes: trimText(doc.guide?.countryData?.healthNotes),
    moneyNotes: trimText(doc.guide?.countryData?.moneyNotes),
  }

  next.guide.localShared = {
    headline: trimText(doc.guide?.localShared?.headline),
    subheadline: trimText(doc.guide?.localShared?.subheadline),
    timezone: {
      label: trimText(doc.guide?.localShared?.timezone?.label),
      notes: trimText(doc.guide?.localShared?.timezone?.notes),
    },
    healthSafety: {
      emergencyNumbers: (doc.guide?.localShared?.healthSafety?.emergencyNumbers || []).map((row) => ({
        service: trimText(row.service),
        number: trimText(row.number),
        notes: trimText(row.notes),
      })),
    },
    moneyHandling: {
      currencyDisplay: trimText(doc.guide?.localShared?.moneyHandling?.currencyDisplay),
      exchangeRateDisplay: trimText(doc.guide?.localShared?.moneyHandling?.exchangeRateDisplay),
      atmAvailability: trimText(doc.guide?.localShared?.moneyHandling?.atmAvailability),
      maxWithdrawal: trimText(doc.guide?.localShared?.moneyHandling?.maxWithdrawal),
      withdrawalFee: trimText(doc.guide?.localShared?.moneyHandling?.withdrawalFee),
      cardUsage: trimText(doc.guide?.localShared?.moneyHandling?.cardUsage),
    },
    weather: {
      summary: trimText(doc.guide?.localShared?.weather?.summary),
      monthlyStats: (doc.guide?.localShared?.weather?.monthlyStats || []).map((row) => ({
        month: coerceWeatherMonth(trimText(row.month)),
        avgHighC: valueOrNull(row.avgHighC),
        avgLowC: valueOrNull(row.avgLowC),
        rainfallMm: valueOrNull(row.rainfallMm),
        rainDays: valueOrNull(row.rainDays),
        sunshineHours: valueOrNull(row.sunshineHours),
      })),
    },
    localContext: {
      vibe: trimText(doc.guide?.localShared?.localContext?.vibe),
      walkability: trimText(doc.guide?.localShared?.localContext?.walkability),
    },
  }

  next.guide.explore = {
    intro: trimText(doc.guide?.explore?.intro),
    touristVisaStatus: trimText(doc.guide?.explore?.touristVisaStatus),
    touristVisaNotes: trimText(doc.guide?.explore?.touristVisaNotes),
    exchangeRateInfo: trimText(doc.guide?.explore?.exchangeRateInfo),
    safety: {
      status: trimText(doc.guide?.explore?.safety?.status),
      notes: trimText(doc.guide?.explore?.safety?.notes),
    },
    costOfLivingSummary: trimText(doc.guide?.explore?.costOfLivingSummary),
    highlights: (doc.guide?.explore?.highlights || []).map((row) => ({
      title: trimText(row.title),
      description: trimText(row.description),
      relatedNeighborhoods: extractRelationshipIds(row.relatedNeighborhoods),
      relatedNeighborhoodKeys: [],
    })),
  }

  next.guide.stay = {
    intro: trimText(doc.guide?.stay?.intro),
    touristVisaDuration: trimText(doc.guide?.stay?.touristVisaDuration),
    touristVisaExtensionNotes: trimText(doc.guide?.stay?.touristVisaExtensionNotes),
    timezoneOverlapNote: trimText(doc.guide?.stay?.timezoneOverlapNote),
    monthlyBudgetRange: trimText(doc.guide?.stay?.monthlyBudgetRange),
    internetSpeed: trimText(doc.guide?.stay?.internetSpeed),
    coworking: {
      summary: trimText(doc.guide?.stay?.coworking?.summary),
      notes: trimText(doc.guide?.stay?.coworking?.notes),
    },
    shortTermRent: trimText(doc.guide?.stay?.shortTermRent),
    safety: {
      status: trimText(doc.guide?.stay?.safety?.status),
      notes: trimText(doc.guide?.stay?.safety?.notes),
    },
    highlights: (doc.guide?.stay?.highlights || []).map((row) => ({
      title: trimText(row.title),
      description: trimText(row.description),
      relatedNeighborhoods: extractRelationshipIds(row.relatedNeighborhoods),
      relatedNeighborhoodKeys: [],
    })),
  }

  next.guide.move = {
    intro: trimText(doc.guide?.move?.intro),
    residencyVisa: trimText(doc.guide?.move?.residencyVisa),
    residencyNotes: trimText(doc.guide?.move?.residencyNotes),
    processingTime: trimText(doc.guide?.move?.processingTime),
    familyCostOfLivingRange: trimText(doc.guide?.move?.familyCostOfLivingRange),
    propertyPricesPerSqm: trimText(doc.guide?.move?.propertyPricesPerSqm),
    incomeRequirements: trimText(doc.guide?.move?.incomeRequirements),
    safestDistricts: trimText(doc.guide?.move?.safestDistricts),
    workPermits: trimText(doc.guide?.move?.workPermits),
    highlights: (doc.guide?.move?.highlights || []).map((row) => ({
      title: trimText(row.title),
      description: trimText(row.description),
      relatedNeighborhoods: extractRelationshipIds(row.relatedNeighborhoods),
      relatedNeighborhoodKeys: [],
    })),
  }

  return next
}

export const buildDraftFromPayloadDoc = payloadLocationToDraft

export function mergeDraftPatch(
  current: LocationDocumentDraft,
  patch: Partial<LocationDocumentDraft>
): LocationDocumentDraft {
  const merged = mergeDefinedValues(current, patch)
  merged.draftId = current.draftId
  merged.payloadId = current.payloadId
  merged.updatedAt = new Date().toISOString()
  return merged
}

function resolveNeighborhoodKeys(keys: string[], options: LocationOption[]): number[] {
  const ids = new Set<number>()
  const neighborhoodOptions = options.filter((option) => option.level === 'neighborhood')

  for (const key of keys) {
    const normalizedKey = key.trim().toLowerCase()

    const match = neighborhoodOptions.find(
      (option) => option.locationKey.trim().toLowerCase() === normalizedKey
    )

    if (match) ids.add(match.id)
  }

  return [...ids]
}

export function resolveDraftRelationshipHints(
  draft: LocationDocumentDraft,
  locationOptions: LocationOption[]
): LocationDocumentDraft {
  const next = cloneValue(draft)

  const resolveHighlights = (highlights: HighlightDraft[]) =>
    highlights.map((highlight) => {
      if (!highlight.relatedNeighborhoodKeys.length) return highlight
      const resolvedIds = resolveNeighborhoodKeys(highlight.relatedNeighborhoodKeys, locationOptions)
      if (!resolvedIds.length) return highlight
      return {
        ...highlight,
        relatedNeighborhoods: [...new Set([...highlight.relatedNeighborhoods, ...resolvedIds])],
      }
    })

  next.guide.explore.highlights = resolveHighlights(next.guide.explore.highlights)
  next.guide.stay.highlights = resolveHighlights(next.guide.stay.highlights)
  next.guide.move.highlights = resolveHighlights(next.guide.move.highlights)

  return next
}

export const resolveDraftHints = resolveDraftRelationshipHints

export function collectUnresolvedHintWarnings(
  draft: LocationDocumentDraft,
  locationOptions: LocationOption[]
): string[] {
  const warnings: string[] = []

  const unresolvedHighlightWarnings = (modeLabel: string, highlights: HighlightDraft[]) => {
    for (const highlight of highlights) {
      const unresolvedKeys = highlight.relatedNeighborhoodKeys.filter((key) => {
        const normalized = key.trim().toLowerCase()
        if (!normalized) return false
        return !locationOptions.some(
          (option) => option.level === 'neighborhood' && option.locationKey.trim().toLowerCase() === normalized
        )
      })

      if (unresolvedKeys.length) {
        warnings.push(
          `${modeLabel} highlight "${highlight.title || 'Untitled'}" has unresolved neighborhood keys: ${unresolvedKeys.join(', ')}.`
        )
      }
    }
  }

  unresolvedHighlightWarnings('Explore', draft.guide.explore.highlights)
  unresolvedHighlightWarnings('Stay', draft.guide.stay.highlights)
  unresolvedHighlightWarnings('Move', draft.guide.move.highlights)

  return warnings
}

function buildPayloadHighlight(highlight: HighlightDraft) {
  return {
    title: highlight.title,
    description: highlight.description,
    relatedNeighborhoods: highlight.relatedNeighborhoods,
  }
}

export function buildPayloadLocationBody(
  draft: LocationDocumentDraft,
  locationOptions: LocationOption[]
): PayloadLocationBody {
  const sanitizedDraft = sanitizeLocationDraftShape(draft)
  const resolved = resolveDraftRelationshipHints(sanitizedDraft, locationOptions)
  const country = normalizeKeyPart(resolved.country)
  const city = normalizeKeyPart(resolved.city)
  const neighborhood = normalizeKeyPart(resolved.neighborhood)

  const countryName = resolved.countryName.trim() || formatFallbackName(country)
  const cityName = resolved.cityName.trim() || formatFallbackName(city)
  const neighborhoodName = resolved.neighborhoodName.trim() || formatFallbackName(neighborhood)

  const body: PayloadLocationBody = {
    level: resolved.level,
    country,
    countryName,
  }

  if (resolved.level !== 'country') {
    body.city = city
    body.cityName = cityName
  }

  if (resolved.level === 'neighborhood') {
    body.neighborhood = neighborhood
    body.neighborhoodName = neighborhoodName
  }

  body.guide = {
    media: {
      coverImage: resolved.guide.media.coverImage,
    },
  }

  if (resolved.level === 'country') {
    body.guide.countryData = resolved.guide.countryData
  } else {
    body.guide.localShared = resolved.guide.localShared
    body.guide.explore = {
      ...resolved.guide.explore,
      highlights: resolved.guide.explore.highlights.map(buildPayloadHighlight),
    }
    body.guide.stay = {
      ...resolved.guide.stay,
      highlights: resolved.guide.stay.highlights.map(buildPayloadHighlight),
    }
    body.guide.move = {
      ...resolved.guide.move,
      highlights: resolved.guide.move.highlights.map(buildPayloadHighlight),
    }
  }

  return (pruneEmptyValues(body) || body) as PayloadLocationBody
}

export function validateDraft(draft: LocationDocumentDraft): string | null {
  if (!normalizeKeyPart(draft.country)) return 'Country key is required.'
  if (!draft.countryName.trim() && !normalizeKeyPart(draft.country)) return 'Country name is required.'

  if ((draft.level === 'city' || draft.level === 'neighborhood') && !normalizeKeyPart(draft.city)) {
    return 'City key is required for city and neighborhood locations.'
  }

  if ((draft.level === 'city' || draft.level === 'neighborhood') && !draft.cityName.trim() && !normalizeKeyPart(draft.city)) {
    return 'City name is required for city and neighborhood locations.'
  }

  if (draft.level === 'neighborhood' && !normalizeKeyPart(draft.neighborhood)) {
    return 'Neighborhood key is required for neighborhood locations.'
  }

  if (draft.level === 'neighborhood' && !draft.neighborhoodName.trim() && !normalizeKeyPart(draft.neighborhood)) {
    return 'Neighborhood name is required for neighborhood locations.'
  }

  return null
}

export function formatLocationLabel(location: Pick<LocationIndexRow, 'level' | 'countryName' | 'cityName' | 'neighborhoodName' | 'locationKey'>): string {
  if (location.level === 'country') {
    return location.countryName || location.locationKey
  }

  if (location.level === 'city') {
    return location.cityName || location.locationKey
  }

  return location.neighborhoodName || location.locationKey
}
