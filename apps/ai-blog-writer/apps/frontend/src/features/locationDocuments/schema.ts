import { DEFAULT_EDITOR_ASSIST_MODEL } from '../staging/api'
import locationGuideContract from '@location-guide-contract'
import type {
  CurrencyOption,
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
  clampRelationshipSelections,
  cloneValue,
  createDefaultObjectFromFields,
  getValueAtPath,
  mergeDefinedValues,
  pruneEmptyValues,
  setValueAtPath,
} from './utils'

const LOCATION_GUIDE_CONTRACT = locationGuideContract as {
  sectionOrder: LocationSectionDefinition['id'][]
  sections: Record<
    LocationSectionDefinition['id'],
    {
      label: string
      path: string
      levels: LocationLevel[]
    }
  >
  sectionPathsByLevel: Record<LocationLevel, string[]>
  aiFieldPaths: string[]
  relationshipHints: {
    neighborhoods: string[]
  }
}

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

function normalizeCurrencyCode(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function coerceWeatherMonth(value: string): WeatherMonth | '' {
  return MONTH_OPTIONS.some((option) => option.value === value)
    ? value as WeatherMonth
    : ''
}

const isLocalLevel = (draft: LocationDocumentDraft): boolean => draft.level === 'city' || draft.level === 'neighborhood'
const isNeighborhoodLevel = (draft: LocationDocumentDraft): boolean => draft.level === 'neighborhood'
const isCityLevel = (draft: LocationDocumentDraft): boolean => draft.level === 'city'

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
  relationTo: 'locations' | 'media-sets' | 'currencies',
  optionSource: 'locations' | 'neighborhoods' | 'mediaSets' | 'currencies',
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
    maxSelections: 4,
    description: 'Choose up to 4 neighborhoods or districts for this highlight.',
    hintKey: 'relatedNeighborhoodKeys',
    hintLabel: 'AI locationKey hints',
    visibleWhen: isCityLevel,
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
    id: 'core',
    label: LOCATION_GUIDE_CONTRACT.sections.core.label,
    description: 'Primary city guide content. Neighborhood drafts only keep localized overlays instead of repeating city-wide facts.',
    levels: LOCATION_GUIDE_CONTRACT.sections.core.levels,
    path: ['guide', 'core'],
    aiPath: 'guide.core',
    fields: [
      textField('headline', 'Headline', { aiEnabled: true }),
      textareaField('subheadline', 'Subheadline', { aiEnabled: true }),
      {
        ...groupField('timezone', 'Timezone', [
          textField('label', 'Label', { aiEnabled: true }),
          textareaField('notes', 'Notes', { aiEnabled: true }),
        ], 'City-wide timezone baseline.'),
        visibleWhen: isCityLevel,
      },
      groupField('safety', 'Safety', [
        textField('status', 'Status', { aiEnabled: true }),
        textareaField('notes', 'Notes', { aiEnabled: true }),
      ]),
      {
        ...groupField('healthSafety', 'Health & Safety', [
          arrayField('emergencyNumbers', 'Emergency Numbers', emergencyNumberFields, {
            addLabel: 'Add emergency number',
            maxRows: 12,
            aiEnabled: true,
          }),
        ]),
        visibleWhen: isCityLevel,
      },
      {
        ...groupField('moneyHandling', 'Money Handling', [
          relationshipField('currency', 'Currency', 'currencies', 'currencies', {
            description: 'Reusable currency reference for this city.',
          }),
          textareaField(
            'exchangeRateNotes',
            'Exchange Rate Notes',
            {
              aiEnabled: true,
              description: 'Editorial context only. The live USD rate preview comes from the linked currency.',
            },
          ),
          textareaField('atmAvailability', 'ATM Availability', { aiEnabled: true }),
          textField('maxWithdrawal', 'Max Withdrawal', { aiEnabled: true }),
          textField('withdrawalFee', 'Withdrawal Fee', { aiEnabled: true }),
          textField('cardUsage', 'Card Usage', { aiEnabled: true }),
        ]),
        visibleWhen: isCityLevel,
      },
      {
        ...groupField('weather', 'Weather', [
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
            aiEnabled: true,
          }),
        ]),
        visibleWhen: isCityLevel,
      },
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
      textField('touristVisaStatus', 'Tourist Visa Status', { aiEnabled: true, visibleWhen: isCityLevel }),
      textareaField('touristVisaNotes', 'Tourist Visa Notes', { aiEnabled: true, visibleWhen: isCityLevel }),
      textField('exchangeRateInfo', 'Exchange Rate Info', { aiEnabled: true, visibleWhen: isCityLevel }),
      textField('costOfLivingSummary', 'Cost of Living Summary', { aiEnabled: true, visibleWhen: isCityLevel }),
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
      textField('touristVisaDuration', 'Tourist Visa Duration', { aiEnabled: true, visibleWhen: isCityLevel }),
      textareaField('touristVisaExtensionNotes', 'Tourist Visa Extension Notes', { aiEnabled: true, visibleWhen: isCityLevel }),
      textareaField('timezoneOverlapNote', 'Timezone Overlap Note', { aiEnabled: true, visibleWhen: isCityLevel }),
      textField('monthlyBudgetRange', 'Monthly Budget Range', { aiEnabled: true }),
      textField('internetSpeed', 'Internet Speed', { aiEnabled: true }),
      groupField('coworking', 'Coworking', [
        textField('summary', 'Summary', { aiEnabled: true }),
        textareaField('notes', 'Notes', { aiEnabled: true }),
      ]),
      textField('shortTermRent', 'Short-Term Rent', { aiEnabled: true }),
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
      textField('residencyVisa', 'Residency Visa', { aiEnabled: true, visibleWhen: isCityLevel }),
      textareaField('residencyNotes', 'Residency Notes', { aiEnabled: true, visibleWhen: isCityLevel }),
      textField('processingTime', 'Processing Time', { aiEnabled: true, visibleWhen: isCityLevel }),
      textField('familyCostOfLivingRange', 'Family Cost of Living Range', { aiEnabled: true }),
      textField('propertyPricesPerSqm', 'Property Prices Per Sqm', { aiEnabled: true }),
      textField('incomeRequirements', 'Income Requirements', { aiEnabled: true, visibleWhen: isCityLevel }),
      textField('safestDistricts', 'Safest Districts', { aiEnabled: true, visibleWhen: isCityLevel }),
      textField('workPermits', 'Work Permits', { aiEnabled: true, visibleWhen: isCityLevel }),
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

export const FIELD_AI_PATHS = LOCATION_GUIDE_CONTRACT.aiFieldPaths as readonly string[]

function createEmptyMediaDraft(): MediaDraft {
  return {
    coverImage: null,
  }
}

function createEmptyCoreDraft(): LocationGuideDraft['core'] {
  return {
    headline: '',
    subheadline: '',
    timezone: {
      label: '',
      notes: '',
    },
    safety: {
      status: '',
      notes: '',
    },
    healthSafety: {
      emergencyNumbers: [],
    },
    moneyHandling: {
      currency: null,
      currencyCode: '',
      exchangeRateNotes: '',
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

function stripNeighborhoodOnlyGuideFields(draft: LocationDocumentDraft): LocationDocumentDraft {
  if (draft.level !== 'neighborhood') {
    return draft
  }

  const next = cloneValue(draft)
  const emptyCore = createEmptyCoreDraft()
  const emptyExplore = createEmptyExploreDraft()
  const emptyStay = createEmptyStayDraft()
  const emptyMove = createEmptyMoveDraft()

  next.guide.core.timezone = emptyCore.timezone
  next.guide.core.healthSafety = emptyCore.healthSafety
  next.guide.core.moneyHandling = emptyCore.moneyHandling
  next.guide.core.weather = emptyCore.weather

  next.guide.explore.touristVisaStatus = emptyExplore.touristVisaStatus
  next.guide.explore.touristVisaNotes = emptyExplore.touristVisaNotes
  next.guide.explore.exchangeRateInfo = emptyExplore.exchangeRateInfo
  next.guide.explore.costOfLivingSummary = emptyExplore.costOfLivingSummary

  next.guide.stay.touristVisaDuration = emptyStay.touristVisaDuration
  next.guide.stay.touristVisaExtensionNotes = emptyStay.touristVisaExtensionNotes
  next.guide.stay.timezoneOverlapNote = emptyStay.timezoneOverlapNote

  next.guide.move.residencyVisa = emptyMove.residencyVisa
  next.guide.move.residencyNotes = emptyMove.residencyNotes
  next.guide.move.processingTime = emptyMove.processingTime
  next.guide.move.incomeRequirements = emptyMove.incomeRequirements
  next.guide.move.safestDistricts = emptyMove.safestDistricts
  next.guide.move.workPermits = emptyMove.workPermits

  const clearHighlightRelationships = (highlight: HighlightDraft): HighlightDraft => ({
    ...highlight,
    relatedNeighborhoods: [],
    relatedNeighborhoodKeys: [],
  })

  next.guide.explore.highlights = next.guide.explore.highlights.map(clearHighlightRelationships)
  next.guide.stay.highlights = next.guide.stay.highlights.map(clearHighlightRelationships)
  next.guide.move.highlights = next.guide.move.highlights.map(clearHighlightRelationships)

  return next
}

function normalizeDraftForLevel(draft: LocationDocumentDraft): LocationDocumentDraft {
  if (draft.level === 'neighborhood') {
    return stripNeighborhoodOnlyGuideFields(draft)
  }

  return draft
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
      core: createEmptyCoreDraft(),
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
    return sanitizeFieldCollection(field.fields, source)
  }

  if (field.type === 'array') {
    if (!Array.isArray(rawValue)) return []
    return rawValue.map((rowValue) => {
      const source = isRecord(rowValue) ? rowValue : {}
      return sanitizeFieldCollection(field.fields, source)
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

function sanitizeFieldCollection(
  fields: LocationFieldDefinition[],
  source: Record<string, unknown>,
): Record<string, unknown> {
  const next = createDefaultObjectFromFields(fields)

  for (const childField of fields) {
    next[childField.key] = sanitizeFieldValue(
      childField,
      source[childField.key],
    )

    if (childField.type === 'relationship' && childField.hintKey) {
      next[childField.hintKey] = sanitizeRelationshipHintValue(
        childField,
        source[childField.hintKey],
      )
    }
  }

  return next
}

function sanitizeRelationshipHintValue(
  field: Extract<LocationFieldDefinition, { type: 'relationship' }>,
  rawValue: unknown,
): unknown {
  if (!field.hintKey) return undefined

  if (field.hasMany) {
    if (!Array.isArray(rawValue)) return []
    return rawValue
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
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

    if (field.type === 'relationship' && field.hintKey) {
      const hintPath = [...basePath, field.hintKey]
      const hintRawValue = getValueAtPath(source, hintPath)
      const sanitizedHintValue = sanitizeRelationshipHintValue(field, hintRawValue)
      nextDraft = setValueAtPath(nextDraft, hintPath, sanitizedHintValue)
    }
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

  if (isRecord(input.guide)) {
    const rawCurrencyCode = getValueAtPath(input, ['guide', 'core', 'moneyHandling', 'currencyCode'])
    const rawExchangeRateNotes = getValueAtPath(input, ['guide', 'core', 'moneyHandling', 'exchangeRateNotes'])
    const rawLegacyExchangeRateDisplay = getValueAtPath(input, ['guide', 'core', 'moneyHandling', 'exchangeRateDisplay'])
    sanitized.guide.core.moneyHandling.currencyCode = normalizeCurrencyCode(
      typeof rawCurrencyCode === 'string' ? rawCurrencyCode : '',
    )
    sanitized.guide.core.moneyHandling.exchangeRateNotes = trimText(
      typeof rawExchangeRateNotes === 'string'
        ? rawExchangeRateNotes
        : typeof rawLegacyExchangeRateDisplay === 'string'
          ? rawLegacyExchangeRateDisplay
          : '',
    )
  }

  return normalizeDraftForLevel(sanitized)
}

export function getVisibleSections(level: LocationLevel): LocationSectionDefinition[] {
  const visibleIds = LOCATION_GUIDE_CONTRACT.sectionPathsByLevel[level]
    .map((path) => (
      path === 'identity'
        ? 'hierarchy'
        : LOCATION_GUIDE_CONTRACT.sectionOrder.find(
            (sectionId) => LOCATION_GUIDE_CONTRACT.sections[sectionId].path === path,
          )
    ))
    .filter((sectionId): sectionId is LocationSectionDefinition['id'] => Boolean(sectionId))

  return visibleIds
    .map((sectionId) => LOCATION_SECTION_DEFINITIONS.find((section) => section.id === sectionId))
    .filter((section): section is LocationSectionDefinition => Boolean(section))
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
  return JSON.stringify(LOCATION_GUIDE_CONTRACT, null, 2)
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

function resolveCurrencyOptionById(
  currencyId: number | null | undefined,
  currencyOptions: CurrencyOption[],
): CurrencyOption | null {
  if (typeof currencyId !== 'number' || !Number.isFinite(currencyId)) return null
  return currencyOptions.find((option) => option.id === currencyId) ?? null
}

function resolveCurrencyOptionByCode(
  currencyCode: string | null | undefined,
  currencyOptions: CurrencyOption[],
): CurrencyOption | null {
  const normalizedCode = normalizeCurrencyCode(currencyCode)
  if (!normalizedCode) return null
  return currencyOptions.find((option) => normalizeCurrencyCode(option.code) === normalizedCode) ?? null
}

function syncDraftCurrencySelection(
  draft: LocationDocumentDraft,
  currencyOptions: CurrencyOption[],
): LocationDocumentDraft {
  if (draft.level !== 'city') {
    return draft
  }

  const next = cloneValue(draft)
  const currentMoneyHandling = next.guide.core.moneyHandling
  const selectedOption = resolveCurrencyOptionById(currentMoneyHandling.currency, currencyOptions)
  const hintedOption = resolveCurrencyOptionByCode(currentMoneyHandling.currencyCode, currencyOptions)

  if (selectedOption) {
    currentMoneyHandling.currencyCode = normalizeCurrencyCode(selectedOption.code)
    return next
  }

  if (hintedOption) {
    currentMoneyHandling.currency = hintedOption.id
    currentMoneyHandling.currencyCode = normalizeCurrencyCode(hintedOption.code)
    return next
  }

  currentMoneyHandling.currencyCode = normalizeCurrencyCode(currentMoneyHandling.currencyCode)
  return next
}

export function payloadLocationToDraft(doc: PayloadLocationDoc): LocationDocumentDraft {
  const draft = createEmptyLocationDraft()
  const legacyGuide = (doc.guide as (PayloadLocationGuide & {
    localShared?: PayloadLocationGuide['core']
  }) | undefined)
  const payloadCore = legacyGuide?.core ?? legacyGuide?.localShared
  const legacyMoneyHandling = payloadCore?.moneyHandling as ({
    exchangeRateNotes?: string | null
    exchangeRateDisplay?: string | null
  } | null | undefined)

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

  next.guide.core = {
    headline: trimText(payloadCore?.headline),
    subheadline: trimText(payloadCore?.subheadline),
    timezone: {
      label: trimText(payloadCore?.timezone?.label),
      notes: trimText(payloadCore?.timezone?.notes),
    },
    safety: {
      status: trimText(payloadCore?.safety?.status),
      notes: trimText(payloadCore?.safety?.notes),
    },
    healthSafety: {
      emergencyNumbers: (payloadCore?.healthSafety?.emergencyNumbers || []).map((row) => ({
        service: trimText(row.service),
        number: trimText(row.number),
        notes: trimText(row.notes),
      })),
    },
    moneyHandling: {
      currency: extractRelationshipId(payloadCore?.moneyHandling?.currency),
      currencyCode: '',
      exchangeRateNotes: trimText(
        legacyMoneyHandling?.exchangeRateNotes ?? legacyMoneyHandling?.exchangeRateDisplay,
      ),
      atmAvailability: trimText(payloadCore?.moneyHandling?.atmAvailability),
      maxWithdrawal: trimText(payloadCore?.moneyHandling?.maxWithdrawal),
      withdrawalFee: trimText(payloadCore?.moneyHandling?.withdrawalFee),
      cardUsage: trimText(payloadCore?.moneyHandling?.cardUsage),
    },
    weather: {
      summary: trimText(payloadCore?.weather?.summary),
      monthlyStats: (payloadCore?.weather?.monthlyStats || []).map((row) => ({
        month: coerceWeatherMonth(trimText(row.month)),
        avgHighC: valueOrNull(row.avgHighC),
        avgLowC: valueOrNull(row.avgLowC),
        rainfallMm: valueOrNull(row.rainfallMm),
        rainDays: valueOrNull(row.rainDays),
        sunshineHours: valueOrNull(row.sunshineHours),
      })),
    },
    localContext: {
      vibe: trimText(payloadCore?.localContext?.vibe),
      walkability: trimText(payloadCore?.localContext?.walkability),
    },
  }

  next.guide.explore = {
    intro: trimText(doc.guide?.explore?.intro),
    touristVisaStatus: trimText(doc.guide?.explore?.touristVisaStatus),
    touristVisaNotes: trimText(doc.guide?.explore?.touristVisaNotes),
    exchangeRateInfo: trimText(doc.guide?.explore?.exchangeRateInfo),
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

  return normalizeDraftForLevel(next)
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
  return normalizeDraftForLevel(merged)
}

function buildNeighborhoodHintCandidates(
  key: string,
  draft: Pick<LocationDocumentDraft, 'country' | 'city'>,
): string[] {
  const normalizedSegments = key
    .split('|')
    .map((segment) => normalizeKeyPart(segment))
    .filter(Boolean)
  const normalizedCountry = normalizeKeyPart(draft.country)
  const normalizedCity = normalizeKeyPart(draft.city)
  const candidates = new Set<string>()

  if (!normalizedSegments.length) return []

  candidates.add(normalizedSegments.join('|'))
  candidates.add(normalizedSegments[normalizedSegments.length - 1] || '')

  if (normalizedSegments.length === 1 && normalizedCity) {
    const cityPrefixes = normalizedCity
      .split('-')
      .filter(Boolean)
      .map((_, index, parts) => parts.slice(0, index + 1).join('-'))

    for (const prefix of cityPrefixes) {
      const cityPrefixedValue = normalizedSegments[0] || ''
      if (cityPrefixedValue.startsWith(`${prefix}-`)) {
        candidates.add(cityPrefixedValue.slice(prefix.length + 1))
      }
    }
  }

  if (normalizedSegments.length === 1 && normalizedCountry && normalizedCity) {
    candidates.add(`${normalizedCountry}|${normalizedCity}|${normalizedSegments[0]}`)
  }

  if (normalizedSegments.length === 2 && normalizedCountry) {
    candidates.add(`${normalizedCountry}|${normalizedSegments.join('|')}`)
  }

  return [...candidates].filter(Boolean)
}

function normalizeLocationOptionPart(value: string | null | undefined): string {
  return normalizeKeyPart(value ?? '')
}

function resolveNeighborhoodKeyId(
  key: string,
  draft: Pick<LocationDocumentDraft, 'country' | 'city'>,
  options: LocationOption[],
): number | null {
  const candidates = buildNeighborhoodHintCandidates(key, draft)
  if (!candidates.length) return null

  const neighborhoodOptions = options.filter((option) => option.level === 'neighborhood')
  const normalizedCountry = normalizeKeyPart(draft.country)
  const normalizedCity = normalizeKeyPart(draft.city)
  const scopedNeighborhoodOptions = neighborhoodOptions.filter((option) => (
    (!normalizedCountry || normalizeLocationOptionPart(option.country) === normalizedCountry)
    && (!normalizedCity || normalizeLocationOptionPart(option.city) === normalizedCity)
  ))

  const findSingleMatch = (pool: LocationOption[]): LocationOption | null => {
    for (const candidate of candidates) {
      const locationKeyMatches = pool.filter(
        (option) => normalizeKeyPart(option.locationKey) === candidate,
      )
      if (locationKeyMatches.length === 1) return locationKeyMatches[0] || null

      const slugMatches = pool.filter(
        (option) => normalizeLocationOptionPart(option.neighborhood) === candidate,
      )
      if (slugMatches.length === 1) return slugMatches[0] || null

      const labelMatches = pool.filter(
        (option) => normalizeLocationOptionPart(option.neighborhoodName) === candidate,
      )
      if (labelMatches.length === 1) return labelMatches[0] || null
    }

    return null
  }

  return findSingleMatch(scopedNeighborhoodOptions)?.id
    ?? findSingleMatch(neighborhoodOptions)?.id
    ?? null
}

function resolveNeighborhoodKeys(
  keys: string[],
  draft: Pick<LocationDocumentDraft, 'country' | 'city'>,
  options: LocationOption[],
): number[] {
  const ids = new Set<number>()

  for (const key of keys) {
    const resolvedId = resolveNeighborhoodKeyId(key, draft, options)
    if (resolvedId !== null) ids.add(resolvedId)
  }

  return [...ids]
}

export function resolveDraftRelationshipHints(
  draft: LocationDocumentDraft,
  locationOptions: LocationOption[],
  currencyOptions: CurrencyOption[] = [],
): LocationDocumentDraft {
  const next = syncDraftCurrencySelection(draft, currencyOptions)

  if (next.level !== 'city') {
    return next
  }

  const resolveHighlights = (highlights: HighlightDraft[]) =>
    highlights.map((highlight) => {
      const relatedNeighborhoodKeys = Array.isArray(highlight.relatedNeighborhoodKeys)
        ? highlight.relatedNeighborhoodKeys
        : []
      const relatedNeighborhoods = Array.isArray(highlight.relatedNeighborhoods)
        ? highlight.relatedNeighborhoods
        : []

      if (!relatedNeighborhoodKeys.length) {
        return {
          ...highlight,
          relatedNeighborhoodKeys,
          relatedNeighborhoods,
        }
      }

      const resolvedIds = resolveNeighborhoodKeys(relatedNeighborhoodKeys, next, locationOptions)
      if (!resolvedIds.length) {
        return {
          ...highlight,
          relatedNeighborhoodKeys,
          relatedNeighborhoods,
        }
      }

      return {
        ...highlight,
        relatedNeighborhoodKeys,
        relatedNeighborhoods: clampRelationshipSelections(
          [...new Set([...relatedNeighborhoods, ...resolvedIds])],
          4,
        ),
      }
    })

  next.guide.explore.highlights = resolveHighlights(next.guide.explore.highlights)
  next.guide.stay.highlights = resolveHighlights(next.guide.stay.highlights)
  next.guide.move.highlights = resolveHighlights(next.guide.move.highlights)

  return next
}

export const resolveDraftHints = resolveDraftRelationshipHints

export function preserveDraftRelationshipHints(
  draft: LocationDocumentDraft,
  sourceDraft: LocationDocumentDraft,
): LocationDocumentDraft {
  const next = cloneValue(draft)

  if (sourceDraft.level === 'city') {
    const sourceCurrencyCode = normalizeCurrencyCode(sourceDraft.guide.core.moneyHandling.currencyCode)
    if (sourceCurrencyCode && !normalizeCurrencyCode(next.guide.core.moneyHandling.currencyCode)) {
      next.guide.core.moneyHandling.currencyCode = sourceCurrencyCode
    }
  }

  const mergeHighlights = (
    targetHighlights: HighlightDraft[],
    sourceHighlights: HighlightDraft[],
  ) =>
    targetHighlights.map((highlight, index) => ({
      ...highlight,
      relatedNeighborhoodKeys: Array.isArray(sourceHighlights[index]?.relatedNeighborhoodKeys)
        ? sourceHighlights[index]?.relatedNeighborhoodKeys ?? []
        : [],
    }))

  next.guide.explore.highlights = mergeHighlights(
    next.guide.explore.highlights,
    sourceDraft.guide.explore.highlights,
  )
  next.guide.stay.highlights = mergeHighlights(
    next.guide.stay.highlights,
    sourceDraft.guide.stay.highlights,
  )
  next.guide.move.highlights = mergeHighlights(
    next.guide.move.highlights,
    sourceDraft.guide.move.highlights,
  )

  return next
}

export function collectUnresolvedHintWarnings(
  draft: LocationDocumentDraft,
  locationOptions: LocationOption[],
  currencyOptions: CurrencyOption[] = [],
): string[] {
  if (draft.level !== 'city') {
    return []
  }

  const warnings: string[] = []
  const normalizedCurrencyCode = normalizeCurrencyCode(draft.guide.core.moneyHandling.currencyCode)
  const selectedCurrencyId = draft.guide.core.moneyHandling.currency

  if (
    normalizedCurrencyCode
    && (typeof selectedCurrencyId !== 'number' || !Number.isFinite(selectedCurrencyId))
    && !resolveCurrencyOptionByCode(normalizedCurrencyCode, currencyOptions)
  ) {
    warnings.push(`Money Handling has an unresolved currency code: ${normalizedCurrencyCode}.`)
  }

  const unresolvedHighlightWarnings = (modeLabel: string, highlights: HighlightDraft[]) => {
    for (const highlight of highlights) {
      const unresolvedKeys = (Array.isArray(highlight.relatedNeighborhoodKeys)
        ? highlight.relatedNeighborhoodKeys
        : []).filter((key) => {
        return resolveNeighborhoodKeyId(key, draft, locationOptions) === null
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

export function buildPayloadLocationBody(
  draft: LocationDocumentDraft,
  locationOptions: LocationOption[],
  currencyOptions: CurrencyOption[] = [],
): PayloadLocationBody {
  const sanitizedDraft = sanitizeLocationDraftShape(draft)
  const resolved = normalizeDraftForLevel(
    resolveDraftRelationshipHints(sanitizedDraft, locationOptions, currencyOptions),
  )
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

  const buildPayloadHighlightForLevel = (highlight: HighlightDraft) => ({
    title: highlight.title,
    description: highlight.description,
    relatedNeighborhoods: resolved.level === 'city'
      ? clampRelationshipSelections(highlight.relatedNeighborhoods, 4)
      : [],
  })

  body.guide = {
    media: {
      coverImage: resolved.guide.media.coverImage,
    },
  }

  if (resolved.level !== 'country') {
    const payloadCore = cloneValue(resolved.guide.core)
    delete payloadCore.moneyHandling.currencyCode
    body.guide.core = payloadCore
    body.guide.explore = {
      ...resolved.guide.explore,
      highlights: resolved.guide.explore.highlights.map(buildPayloadHighlightForLevel),
    }
    body.guide.stay = {
      ...resolved.guide.stay,
      highlights: resolved.guide.stay.highlights.map(buildPayloadHighlightForLevel),
    }
    body.guide.move = {
      ...resolved.guide.move,
      highlights: resolved.guide.move.highlights.map(buildPayloadHighlightForLevel),
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
