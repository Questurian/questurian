import type { HomepageFeaturedItemRef } from '../types'
import type { HomepageLocationGridItemRef } from '../locationGridTypes'
import type { HomepageHotelGridItemRef } from '../hotelGridTypes'
import type { PageBlockResponse } from '../pageBlocks'

export type LocationRef = {
  id: number
  locationKey: string | null
  level: string | null
  countryName: string | null
  cityName?: string | null
  neighborhoodName?: string | null
}

export type LocationHomepageListItem = {
  id: number
  isEnabled: boolean
  updatedAt: string | null
  location: LocationRef | null
}

export type LocationHomepageResponse = {
  id: number
  isEnabled: boolean
  location: LocationRef | null
  pageBlocks: PageBlockResponse[]
  publishedPageBlocks: PageBlockResponse[]
  lastPublishedAt?: string | null
  lastPublishedBy?: unknown
  publishedRevision?: number | null
}

export type DeleteLocationHomepageBlockResponse = {
  deletedBlockId: string
}

export type ReorderLocationHomepageBlocksResponse = {
  orderedBlockIds: string[]
}

export type ConvertLocationHomepageBlockResponse = {
  block: PageBlockResponse
}

export type ResetAllHomepageContentResponse = {
  locationHomepagesCleared: number
}

export type HomepageBlockSaveItem =
  | HomepageFeaturedItemRef
  | HomepageLocationGridItemRef
  | HomepageHotelGridItemRef
