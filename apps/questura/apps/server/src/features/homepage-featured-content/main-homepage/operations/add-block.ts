import { parseNewBlockInput } from '../../resolve-page-blocks/service'
import {
  getDraftPageBlocks,
  getMainHomepagePayload,
  loadMainHomepage,
  updateAndFormatMainHomepageBlocks,
} from '../lib/persistence'
import type {
  MainHomepageErrorBody,
  MainHomepageOperationResult,
} from '../types'

export async function addMainHomepageBlock(
  body: unknown,
): Promise<MainHomepageOperationResult<Awaited<ReturnType<typeof updateAndFormatMainHomepageBlocks>> | MainHomepageErrorBody>> {
  const parsed = parseNewBlockInput(body)
  if (!parsed.ok) return { status: parsed.status, body: { message: parsed.message } }

  const payload = await getMainHomepagePayload()
  const doc = await loadMainHomepage(payload)
  const blocks = [...getDraftPageBlocks(doc), parsed.block]
  const formatted = await updateAndFormatMainHomepageBlocks(payload, blocks)

  return { status: 201, body: formatted }
}
