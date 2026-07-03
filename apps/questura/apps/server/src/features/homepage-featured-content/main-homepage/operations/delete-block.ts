import {
  formatMainHomepage,
  getDraftPageBlocks,
  getMainHomepagePayload,
  loadMainHomepage,
  updateMainHomepageDraft,
} from '../lib/persistence'
import type { MainHomepageOperationResult } from '../types'

type DeleteBlockBody = { deletedBlockId: string } | { message: string }

export async function deleteMainHomepageBlock(
  body: unknown,
  leanResponse: boolean,
): Promise<MainHomepageOperationResult<Awaited<ReturnType<typeof formatMainHomepage>> | DeleteBlockBody>> {
  const blockId: unknown = (body as { blockId?: unknown } | null)?.blockId
  if (typeof blockId !== 'string' || blockId.trim().length === 0) {
    return { status: 400, body: { message: 'blockId (string) is required.' } }
  }

  const payload = await getMainHomepagePayload()
  const doc = await loadMainHomepage(payload)
  const blocks = getDraftPageBlocks(doc)
  const updatedBlocks = blocks.filter((block) => block.id !== blockId)

  if (updatedBlocks.length === blocks.length) {
    return { status: 404, body: { message: `Block ${blockId} not found in main homepage.` } }
  }

  const updated = await updateMainHomepageDraft(payload, updatedBlocks)
  return leanResponse
    ? { status: 200, body: { deletedBlockId: blockId } }
    : { status: 200, body: await formatMainHomepage(payload, updated) }
}
