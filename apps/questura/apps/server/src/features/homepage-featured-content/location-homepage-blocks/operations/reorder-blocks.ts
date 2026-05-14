import { reorderBlocksByIds } from '@/shared/utils/reorder-blocks'

import type { RawBlock } from '../../resolve-page-blocks/service'

import {
  getLocationHomepageBlocksPayload,
  loadLocationHomepage,
  updateAndFormatLocationHomepageBlocks,
  updateLocationHomepageBlocks,
} from '../lib/persistence'
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
  const depth = leanResponse ? 0 : 1
  const payload = await getLocationHomepageBlocksPayload()
  const doc = await loadLocationHomepage(payload, id, depth)
  const existingBlocks: RawBlock[] = doc.pageBlocks ?? []
  const orderedBlockIds = (body as { orderedBlockIds?: unknown } | null)?.orderedBlockIds
  const reorderResult = reorderBlocksByIds(existingBlocks, orderedBlockIds)

  if (!reorderResult.ok) {
    return { status: 400, body: { message: reorderResult.message } }
  }

  if (leanResponse) {
    await updateLocationHomepageBlocks(payload, id, reorderResult.reordered, 0)
    return {
      status: 200,
      body: { orderedBlockIds: reorderResult.reordered.map((block) => block.id) },
    }
  }

  const formatted = await updateAndFormatLocationHomepageBlocks(
    payload,
    id,
    reorderResult.reordered,
    1,
  )
  return { status: 200, body: formatted }
}
