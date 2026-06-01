import { locationHomepageRequest } from '../request'
import type {
  ConvertLocationHomepageBlockResponse,
  DeleteLocationHomepageBlockResponse,
  HomepageBlockSaveItem,
  LocationHomepageResponse,
  ReorderLocationHomepageBlocksResponse
} from '../types'

export async function updateLocationHomepageBlock(
  token: string,
  id: number,
  blockId: string,
  items: HomepageBlockSaveItem[],
  slotCount?: number
): Promise<LocationHomepageResponse> {
  const body: Record<string, unknown> = { blockId, items }
  if (typeof slotCount === 'number') body.slotCount = slotCount

  return locationHomepageRequest(`/api/location-homepages/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify(body)
  })
}

/** When a Featured Articles block has no saved items, switch it to another block type; keeps section title. */
export async function convertLocationHomepageFeaturedArticlesBlock(
  token: string,
  homepageId: number,
  blockId: string,
  blockType: string,
  slotCount: number
): Promise<ConvertLocationHomepageBlockResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${homepageId}/blocks/convert?response=lean`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ blockId, blockType, slotCount })
    }
  )
}

export async function addLocationHomepageBlock(
  token: string,
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
    token,
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  )
}

export async function deleteLocationHomepageBlock(
  token: string,
  id: number,
  blockId: string
): Promise<DeleteLocationHomepageBlockResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/blocks?response=lean`,
    token,
    {
      method: 'DELETE',
      body: JSON.stringify({ blockId })
    }
  )
}

export async function reorderLocationHomepageBlocks(
  token: string,
  id: number,
  orderedBlockIds: string[]
): Promise<ReorderLocationHomepageBlocksResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/blocks?response=lean`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({ orderedBlockIds })
    }
  )
}
