export type HomepageTourItemRef = {
  id: number
}

export type HomepageTourCandidate = HomepageTourItemRef & {
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

export type HomepageTourInvalidReason = 'invalid_reference' | 'not_found' | 'not_published'

export type HomepageTourInvalidItem = {
  slot: number
  id?: number
  title?: string | null
  reason: HomepageTourInvalidReason
}

export type HomepageTourSelection = {
  items: HomepageTourCandidate[]
  invalidItems: HomepageTourInvalidItem[]
  isComplete: boolean
  allowDrafts: boolean
  totalSlots: number
}
