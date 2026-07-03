import { reorderBlocksByIds } from '@/shared/utils/reorder-blocks'

import {
  formatMainHomepage,
  getDraftPageBlocks,
  getMainHomepagePayload,
  loadMainHomepage,
  updateMainHomepageDraft,
} from '../lib/persistence'
import type { MainHomepageOperationResult } from '../types'

type ReorderBlockBody = { orderedBlockIds: string[] } | { message: string }

export async function reorderMainHomepageBlocks(
  body: unknown,
  leanResponse: boolean,
): Promise<MainHomepageOperationResult<Awaited<ReturnType<typeof formatMainHomepage>> | ReorderBlockBody>> {
  const payload = await getMainHomepagePayload()
  const doc = await loadMainHomepage(payload)
  const blocks = getDraftPageBlocks(doc)
  const orderedBlockIds = (body as { orderedBlockIds?: unknown } | null)?.orderedBlockIds
  const reorderResult = reorderBlocksByIds(blocks, orderedBlockIds)

  if (!reorderResult.ok) return { status: 400, body: { message: reorderResult.message } }

  const updated = await updateMainHomepageDraft(payload, reorderResult.reordered)
  return leanResponse
    ? {
        status: 200,
        body: { orderedBlockIds: reorderResult.reordered.map((block) => block.id) },
      }
    : { status: 200, body: await formatMainHomepage(payload, updated) }
}
