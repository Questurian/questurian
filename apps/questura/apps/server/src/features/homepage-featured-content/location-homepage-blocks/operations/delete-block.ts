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

type DeleteBlockBody = { deletedBlockId: string } | { message: string }

export async function deleteLocationHomepageBlock(
  id: string,
  body: unknown,
  leanResponse: boolean,
): Promise<LocationHomepageBlocksOperationResult<FormattedLocationHomepage | DeleteBlockBody>> {
  const blockId: unknown = (body as { blockId?: unknown } | null)?.blockId

  if (typeof blockId !== 'string' || blockId.trim().length === 0) {
    return { status: 400, body: { message: 'blockId (string) is required.' } }
  }

  const depth = leanResponse ? 0 : 1
  const payload = await getLocationHomepageBlocksPayload()
  const doc = await loadLocationHomepage(payload, id, depth)
  const existingBlocks: RawBlock[] = doc.pageBlocks ?? []
  const updatedBlocks = existingBlocks.filter((block) => block.id !== blockId)

  if (updatedBlocks.length === existingBlocks.length) {
    return {
      status: 404,
      body: { message: `Block ${blockId} not found in this homepage.` },
    }
  }

  if (leanResponse) {
    await updateLocationHomepageBlocks(payload, id, updatedBlocks, 0)
    return { status: 200, body: { deletedBlockId: blockId } }
  }

  const formatted = await updateAndFormatLocationHomepageBlocks(payload, id, updatedBlocks, 1)
  return { status: 200, body: formatted }
}
