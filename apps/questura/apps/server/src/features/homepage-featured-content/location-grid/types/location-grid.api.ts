import type {
  LocationGridCandidate,
  LocationGridMediaAspect,
  LocationGridScope,
} from './location-grid.types'

export type LocationGridCandidatesResponse = {
  docs: LocationGridCandidate[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
}

export type LocationGridScopeLocationInput = {
  level?: unknown
  locationKey?: unknown
}

export type LocationGridValidationOptions = {
  slotCount?: number
  scope: LocationGridScope | null
}

export type LocationGridSelectionOptions = {
  totalSlots?: number
  scope: LocationGridScope | null
  itemKickers?: unknown
  itemDescriptions?: unknown
}

export type LocationGridSearchOptions = {
  query?: string
  page?: number
  limit?: number
  scope: LocationGridScope | null
}

export type LocationGridMediaAspectParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: LocationGridMediaAspect }
  | { ok: false; message: string }
