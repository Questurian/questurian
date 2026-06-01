import { mainHomepageRequest } from '../request'
import type {
  ConvertHomepageBlockResponse,
  DeleteHomepageBlockResponse,
  HomepageBlockSaveItem,
  MainHomepageResponse,
  ReorderHomepageBlocksResponse,
} from '../types'

export async function updateMainHomepageBlock(
  token: string,
  blockId: string,
  items: HomepageBlockSaveItem[],
  slotCount?: number,
): Promise<MainHomepageResponse> {
  const body: Record<string, unknown> = { blockId, items }
  if (typeof slotCount === 'number') body.slotCount = slotCount

  return mainHomepageRequest('/api/homepage-featured-content', token, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/** When a Featured Articles block has no saved items, switch it to another block type; keeps section title. */
export async function convertMainHomepageFeaturedArticlesBlock(
  token: string,
  blockId: string,
  blockType: string,
  slotCount: number,
): Promise<ConvertHomepageBlockResponse> {
  return mainHomepageRequest('/api/homepage-featured-content/blocks/convert?response=lean', token, {
    method: 'POST',
    body: JSON.stringify({ blockId, blockType, slotCount }),
  })
}

export async function addMainHomepageBlock(
  token: string,
  blockType: string,
  slotCount: number,
  sectionHeading?: string | null,
  sectionSubheading?: string | null,
): Promise<MainHomepageResponse> {
  const body: Record<string, unknown> = { blockType, slotCount }
  if (typeof sectionHeading === 'string' && sectionHeading.trim()) {
    body.sectionHeading = sectionHeading.trim()
  }
  if (typeof sectionSubheading === 'string' && sectionSubheading.trim()) {
    body.sectionSubheading = sectionSubheading.trim()
  }
  return mainHomepageRequest('/api/homepage-featured-content/blocks', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteMainHomepageBlock(
  token: string,
  blockId: string,
): Promise<DeleteHomepageBlockResponse> {
  return mainHomepageRequest('/api/homepage-featured-content/blocks?response=lean', token, {
    method: 'DELETE',
    body: JSON.stringify({ blockId }),
  })
}

export async function reorderMainHomepageBlocks(
  token: string,
  orderedBlockIds: string[],
): Promise<ReorderHomepageBlocksResponse> {
  return mainHomepageRequest('/api/homepage-featured-content/blocks?response=lean', token, {
    method: 'PATCH',
    body: JSON.stringify({ orderedBlockIds }),
  })
}
