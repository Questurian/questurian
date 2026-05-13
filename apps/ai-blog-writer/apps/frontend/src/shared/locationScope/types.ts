export type LocationLevel = 'country' | 'city' | 'neighborhood'

export type LocationScope = {
  keys: string[]
  refs: number[]
}

export type LocationDoc = {
  id: number
  locationKey?: string
  country?: string
  city?: string | null
  neighborhood?: string | null
  level?: LocationLevel
  parentKey?: string | null
}

export type LocationListResponse = {
  docs: LocationDoc[]
  totalDocs: number
  totalPages?: number
}
