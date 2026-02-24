export type LocationScope = {
  keys: string[]
  refs: number[]
}

export type LocationDoc = {
  id: number
  locationKey?: string
}

export type LocationListResponse = {
  docs: LocationDoc[]
  totalDocs: number
  totalPages?: number
}
