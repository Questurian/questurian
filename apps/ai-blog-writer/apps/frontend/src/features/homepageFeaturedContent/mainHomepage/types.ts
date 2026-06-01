import type { HomepageFeaturedItemRef } from '../types'
import type { HomepageLocationGridItemRef } from '../locationGridTypes'
import type { HomepageHotelGridItemRef } from '../hotelGridTypes'
import type { PageBlockResponse } from '../pageBlocks'

export type MainHomepageResponse = {
  pageBlocks: PageBlockResponse[]
  publishedPageBlocks: PageBlockResponse[]
  lastPublishedAt?: string | null
  lastPublishedBy?: unknown
  publishedRevision?: number | null
}

export type DeleteHomepageBlockResponse = {
  deletedBlockId: string
}

export type ReorderHomepageBlocksResponse = {
  orderedBlockIds: string[]
}

export type ConvertHomepageBlockResponse = {
  block: PageBlockResponse
}

export type HomepageBlockSaveItem =
  | HomepageFeaturedItemRef
  | HomepageLocationGridItemRef
  | HomepageHotelGridItemRef
