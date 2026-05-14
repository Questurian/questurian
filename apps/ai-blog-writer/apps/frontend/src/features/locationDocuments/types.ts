export type LocationLevel = 'country' | 'city' | 'neighborhood'

export type PayloadRelationship = number | { id?: number } | null | undefined

export type LocationDocumentDraft = {
  draftId: string
  payloadId?: number
  currentPayloadSignature?: string
  lastPayloadSyncSignature?: string
  lastPayloadSyncAt?: string
  hasUnsyncedPayloadChanges?: boolean
  level: LocationLevel
  country: string
  city: string
  neighborhood: string
  countryName: string
  cityName: string
  neighborhoodName: string
  locationKey?: string | null
  parentKey?: string | null
  coverImage: number | null
  updatedAt: string
}

export type PayloadLocationBody = {
  coverImage: number | null
}

export type PayloadLocationDoc = {
  id: number
  level: LocationLevel
  country: string
  city?: string | null
  neighborhood?: string | null
  countryName?: string | null
  cityName?: string | null
  neighborhoodName?: string | null
  locationKey: string
  parentKey?: string | null
  coverImage?: PayloadRelationship
  guide?: {
    media?: {
      coverImage?: PayloadRelationship
    } | null
  } | null
  createdAt?: string
  updatedAt?: string
}

export type LocationIndexRow = {
  id: number
  level: LocationLevel
  country: string
  city?: string | null
  neighborhood?: string | null
  countryName?: string | null
  cityName?: string | null
  neighborhoodName?: string | null
  locationKey: string
  parentKey?: string | null
  coverImage?: PayloadRelationship
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
  countryName?: string | null
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

export type RelationshipFieldDefinition = {
  key: string
  label: string
  type: 'relationship'
  relationTo: 'media-sets'
  optionSource: 'mediaSets'
  picker?: 'mediaSetLibrary'
}
