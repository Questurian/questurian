import type { Dispatch, SetStateAction } from 'react'
import type {
  ItineraryBlockType,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption
} from '../../types'

export type StopComposeChoice = {
  itemId: string
  dayIndex: number
  targetId: string
  stopTitle: string
  strandsNeighbor: boolean
}

export type ItineraryBuilderAiActionsParams = {
  draft: ListicleItineraryDraft | null
  setDraft: Dispatch<SetStateAction<ListicleItineraryDraft | null>>
  locations: LocationOption[]
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  canonicalStructuredData: string
  onError: (message: string) => void
  setResult: Dispatch<SetStateAction<string | null>>
}
