import type { EditorAssistModelName } from '../staging/api'

export type LocationLevel = 'country' | 'city' | 'neighborhood'
export type LocationSectionKey = 'hierarchy' | 'media' | 'core' | 'explore' | 'stay' | 'move'
export type LocationAiSectionPath =
  | 'identity'
  | 'guide.media'
  | 'guide.core'
  | 'guide.explore'
  | 'guide.stay'
  | 'guide.move'

export type SelectOption = {
  label: string
  value: string
}

export type EmergencyNumber = {
  service: string
  number: string
  notes: string
}

export type WeatherMonth =
  | 'jan'
  | 'feb'
  | 'mar'
  | 'apr'
  | 'may'
  | 'jun'
  | 'jul'
  | 'aug'
  | 'sep'
  | 'oct'
  | 'nov'
  | 'dec'

export type WeatherMonthlyStat = {
  month: WeatherMonth | ''
  avgHighC: number | null
  avgLowC: number | null
  rainfallMm: number | null
  rainDays: number | null
  sunshineHours: number | null
}

export type HighlightItem = {
  title: string
  description: string
  relatedNeighborhoods: number[]
  relatedNeighborhoodKeys: string[]
}

export type SafetyGroup = {
  status: string
  notes: string
}

export type CoreGuide = {
  headline: string
  subheadline: string
  timezone: {
    label: string
    notes: string
  }
  safety: SafetyGroup
  healthSafety: {
    emergencyNumbers: EmergencyNumber[]
  }
  moneyHandling: {
    exchangeRateDisplay: string
    atmAvailability: string
    maxWithdrawal: string
    withdrawalFee: string
    cardUsage: string
  }
  weather: {
    summary: string
    monthlyStats: WeatherMonthlyStat[]
  }
  localContext: {
    vibe: string
    walkability: string
  }
}

export type ExploreGuide = {
  intro: string
  touristVisaStatus: string
  touristVisaNotes: string
  exchangeRateInfo: string
  costOfLivingSummary: string
  highlights: HighlightItem[]
}

export type StayGuide = {
  intro: string
  touristVisaDuration: string
  touristVisaExtensionNotes: string
  timezoneOverlapNote: string
  monthlyBudgetRange: string
  internetSpeed: string
  coworking: {
    summary: string
    notes: string
  }
  shortTermRent: string
  highlights: HighlightItem[]
}

export type MoveGuide = {
  intro: string
  residencyVisa: string
  residencyNotes: string
  processingTime: string
  familyCostOfLivingRange: string
  propertyPricesPerSqm: string
  incomeRequirements: string
  safestDistricts: string
  workPermits: string
  highlights: HighlightItem[]
}

export type MediaGuide = {
  coverImage: number | null
}

export type LocationGuideDraft = {
  media: MediaGuide
  core: CoreGuide
  explore: ExploreGuide
  stay: StayGuide
  move: MoveGuide
}

export type MediaDraft = MediaGuide
export type CoreDraft = CoreGuide
export type ExploreDraft = ExploreGuide
export type StayDraft = StayGuide
export type MoveDraft = MoveGuide
export type HighlightDraft = HighlightItem
export type SafetyDraft = SafetyGroup

export type PayloadRelationship = number | { id?: number } | null | undefined
export type PayloadRelationshipList = Array<number | { id?: number } | null> | null | undefined

export type LocationDocumentDraft = {
  draftId: string
  payloadId?: number
  editorModelName: EditorAssistModelName
  level: LocationLevel
  country: string
  city: string
  neighborhood: string
  countryName: string
  cityName: string
  neighborhoodName: string
  aiSourceNotes: string
  guide: LocationGuideDraft
  updatedAt: string
}

export type PayloadLocationGuide = {
  media?: {
    coverImage?: number | { id?: number } | null
  } | null
  core?: Partial<CoreGuide> | null
  explore?: {
    intro?: string | null
    touristVisaStatus?: string | null
    touristVisaNotes?: string | null
    exchangeRateInfo?: string | null
    costOfLivingSummary?: string | null
    highlights?: Array<{
      title?: string | null
      description?: string | null
      relatedNeighborhoods?: Array<number | { id?: number }> | null
    }> | null
  } | null
  stay?: {
    intro?: string | null
    touristVisaDuration?: string | null
    touristVisaExtensionNotes?: string | null
    timezoneOverlapNote?: string | null
    monthlyBudgetRange?: string | null
    internetSpeed?: string | null
    coworking?: {
      summary?: string | null
      notes?: string | null
    } | null
    shortTermRent?: string | null
    highlights?: Array<{
      title?: string | null
      description?: string | null
      relatedNeighborhoods?: Array<number | { id?: number }> | null
    }> | null
  } | null
  move?: {
    intro?: string | null
    residencyVisa?: string | null
    residencyNotes?: string | null
    processingTime?: string | null
    familyCostOfLivingRange?: string | null
    propertyPricesPerSqm?: string | null
    incomeRequirements?: string | null
    safestDistricts?: string | null
    workPermits?: string | null
    highlights?: Array<{
      title?: string | null
      description?: string | null
      relatedNeighborhoods?: Array<number | { id?: number }> | null
    }> | null
  } | null
}

export type PayloadLocationBody = {
  level: LocationLevel
  country: string
  city?: string
  neighborhood?: string
  countryName?: string
  cityName?: string
  neighborhoodName?: string
  guide?: PayloadLocationGuide
}

export type PayloadLocationDoc = PayloadLocationBody & {
  id: number
  locationKey: string
  parentKey?: string | null
  createdAt?: string
  updatedAt?: string
}

export type LocationIndexRow = {
  id: number
  level: LocationLevel
  country: string
  city?: string | null
  neighborhood?: string | null
  countryName?: string
  cityName?: string | null
  neighborhoodName?: string | null
  locationKey: string
  parentKey?: string | null
  updatedAt?: string
}

export type PayloadListResponse<T> = {
  docs: T[]
  totalDocs: number
  totalPages?: number
}

export type LocationOption = {
  id: number
  level: LocationLevel
  country?: string
  city?: string | null
  neighborhood?: string | null
  countryName?: string
  cityName?: string | null
  neighborhoodName?: string | null
  locationKey: string
}

export type MediaSetOption = {
  id: number
  title: string
  alt_text?: string | null
  location?: string | null
  status?: string | null
  variants?: {
    thumbnail?: number | MediaSetVariantAsset | null
    square?: number | MediaSetVariantAsset | null
    wide?: number | MediaSetVariantAsset | null
    portrait?: number | MediaSetVariantAsset | null
    hero?: number | MediaSetVariantAsset | null
    open_graph?: number | MediaSetVariantAsset | null
    editorial?: number | MediaSetVariantAsset | null
  } | null
}

export type MediaSetVariantAsset = {
  id: number
  filename?: string | null
  url?: string | null
  alt_text?: string | null
}

type FieldBase = {
  key: string
  label: string
  description?: string
  visibleWhen?: (draft: LocationDocumentDraft) => boolean
  width?: 'full' | 'half'
}

export type ScalarFieldDefinition = FieldBase & {
  type: 'text' | 'textarea' | 'number' | 'select'
  options?: SelectOption[]
  placeholder?: string
  aiEnabled?: boolean
}

export type RelationshipFieldDefinition = FieldBase & {
  type: 'relationship'
  relationTo: 'locations' | 'media-sets'
  hasMany?: boolean
  optionSource: 'locations' | 'neighborhoods' | 'mediaSets'
  hintKey?: string
  hintLabel?: string
  picker?: 'mediaSetLibrary'
}

export type GroupFieldDefinition = FieldBase & {
  type: 'group'
  fields: LocationFieldDefinition[]
}

export type ArrayFieldDefinition = FieldBase & {
  type: 'array'
  fields: LocationFieldDefinition[]
  maxRows?: number
  addLabel?: string
  aiEnabled?: boolean
}

export type LocationFieldDefinition =
  | ScalarFieldDefinition
  | RelationshipFieldDefinition
  | GroupFieldDefinition
  | ArrayFieldDefinition

export type LocationSectionDefinition = {
  id: LocationSectionKey
  label: string
  description: string
  levels: LocationLevel[]
  path: string[]
  fields: LocationFieldDefinition[]
  aiPath?: LocationAiSectionPath
}

export type LocationAiFillDocumentRequest = {
  draft: LocationDocumentDraft
  instruction?: string
  sourceNotes?: string
  modelName?: EditorAssistModelName
}

export type LocationAiFillDocumentResponse = {
  document: LocationDocumentDraft
  modelUsed: string
}

export type LocationAiFillSectionRequest = {
  draft: LocationDocumentDraft
  sectionPath: string
  sectionValue: Record<string, unknown> | null
  instruction?: string
  sourceNotes?: string
  modelName?: EditorAssistModelName
}

export type LocationAiFillSectionResponse = {
  sectionPath: string
  section: Record<string, unknown>
  modelUsed: string
}

export type LocationAiFillFieldRequest = {
  draft: LocationDocumentDraft
  fieldPath: string
  currentValue: string
  instruction?: string
  sourceNotes?: string
  modelName?: EditorAssistModelName
}

export type LocationAiFillFieldResponse = {
  fieldPath: string
  value: string
  modelUsed: string
}
