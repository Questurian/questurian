import { reorderBlocksByIds } from '@/shared/utils/reorder-blocks'

import type { RawBlock } from '../../resolve-page-blocks/service'

import {
  getLocationHomepagePayload,
  loadLocationHomepage,
  updateLocationHomepage,
  updateAndFormatLocationHomepageBlocks,
} from '../../location-homepages/lib/persistence'
import type {
  FormattedLocationHomepage,
  LocationHomepageBlocksOperationResult,
} from '../types'

type ReorderBlockBody = { orderedBlockIds: string[] } | { message: string }

export async function reorderLocationHomepageBlocks(
  id: string,
  body: unknown,
  leanResponse: boolean,
): Promise<LocationHomepageBlocksOperationResult<FormattedLocationHomepage | ReorderBlockBody>> {
  const depth = 0
  const payload = await getLocationHomepagePayload()
  const doc = await loadLocationHomepage(payload, id, depth)
  const existingBlocks: RawBlock[] = doc.pageBlocks ?? []
  const orderedBlockIds = (body as { orderedBlockIds?: unknown } | null)?.orderedBlockIds
  const reorderResult = reorderBlocksByIds(existingBlocks, orderedBlockIds)

  if (!reorderResult.ok) {
    return { status: 400, body: { message: reorderResult.message } }
  }

  if (leanResponse) {
    await updateLocationHomepage(payload, id, reorderResult.reordered, 0)
    return {
      status: 200,
      body: { orderedBlockIds: reorderResult.reordered.map((block) => block.id) },
    }
  }

  const formatted = await updateAndFormatLocationHomepageBlocks(
    payload,
    id,
    reorderResult.reordered,
    0,
  )
  return { status: 200, body: formatted }
}
