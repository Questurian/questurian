import { ALL_VARIANT_KEYS } from '../../shared/api/payload/payload.types'
import type { MediaSet, MediaVariantKey } from '../../shared/api/payload/payload.types'

export type MediaSetHealth = {
  score: number // 0-100
  missingAltText: boolean
  missingPhotographerCredit: boolean
  missingLocation: boolean
  missingTitle: boolean
  missingSource: boolean
  presentVariants: MediaVariantKey[]
  missingVariants: MediaVariantKey[]
}

export type BrowseFilters = {
  search: string
  status: string
  locationId: number | null
  missingField: 'alt_text' | 'photographer_credit' | 'location' | 'title' | ''
}

export type AltTextGenerationState = {
  status: 'idle' | 'generating' | 'done' | 'error'
  text: string
}

export { ALL_VARIANT_KEYS }
export type { MediaSet, MediaVariantKey }
