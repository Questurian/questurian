export type HomepageHotelGridItemRef = {
  id: number
}

export type HomepageHotelGridCandidate = HomepageHotelGridItemRef & {
  slot?: number
  title: string
  slug: string | null
  type: string | null
  priceLevel: string | null
  status: string | null
  updatedAt: string | null
  imageUrl: string | null
  location: string | null
}

export type HomepageHotelGridInvalidItem = {
  slot: number
  id?: number
  title?: string | null
  reason: 'invalid_reference' | 'not_found' | 'not_published'
}

export type HomepageHotelGridSelection = {
  items: HomepageHotelGridCandidate[]
  invalidItems: HomepageHotelGridInvalidItem[]
  isComplete: boolean
  allowDrafts: boolean
  totalSlots: number
}

export type HomepageHotelGridCandidatesResponse = {
  docs: HomepageHotelGridCandidate[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  allowDrafts: boolean
}
