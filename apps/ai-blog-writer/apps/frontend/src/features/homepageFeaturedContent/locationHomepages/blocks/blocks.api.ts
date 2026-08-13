import { locationHomepageRequest } from '../request'
import type {
  ConvertLocationHomepageBlockResponse,
  DeleteLocationHomepageBlockResponse,
  HomepageBlockSaveItem,
  LocationHomepageResponse,
  ReorderLocationHomepageBlocksResponse
} from '../types'

export async function updateLocationHomepageBlock(
  id: number,
  blockId: string,
  items: HomepageBlockSaveItem[],
  slotCount?: number
): Promise<LocationHomepageResponse> {
  const body: Record<string, unknown> = { blockId, items }
  if (typeof slotCount === 'number') body.slotCount = slotCount

  return locationHomepageRequest(`/api/location-homepages/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  })
}

/** When a Featured Articles block has no saved items, switch it to another block type; keeps section title. */
export async function convertLocationHomepageFeaturedArticlesBlock(
  homepageId: number,
  blockId: string,
  blockType: string,
  slotCount: number
): Promise<ConvertLocationHomepageBlockResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${homepageId}/blocks/convert?response=lean`,
    {
      method: 'POST',
      body: JSON.stringify({ blockId, blockType, slotCount })
    }
  )
}

export async function addLocationHomepageBlock(
  id: number,
  blockType: string,
  slotCount: number,
  sectionHeading?: string | null,
  sectionSubheading?: string | null
): Promise<LocationHomepageResponse> {
  const body: Record<string, unknown> = { blockType, slotCount }
  if (typeof sectionHeading === 'string' && sectionHeading.trim()) {
    body.sectionHeading = sectionHeading.trim()
  }
  if (typeof sectionSubheading === 'string' && sectionSubheading.trim()) {
    body.sectionSubheading = sectionSubheading.trim()
  }
  return locationHomepageRequest(
    `/api/location-homepages/${id}/blocks`,
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  )
}

export async function deleteLocationHomepageBlock(
  id: number,
  blockId: string
): Promise<DeleteLocationHomepageBlockResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/blocks?response=lean`,
    {
      method: 'DELETE',
      body: JSON.stringify({ blockId })
    }
  )
}

export async function reorderLocationHomepageBlocks(
  id: number,
  orderedBlockIds: string[]
): Promise<ReorderLocationHomepageBlocksResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/blocks?response=lean`,
    {
      method: 'PATCH',
      body: JSON.stringify({ orderedBlockIds })
    }
  )
}
