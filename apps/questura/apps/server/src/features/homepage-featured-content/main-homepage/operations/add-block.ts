import { randomUUID } from 'node:crypto'

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
  // Main homepage blocks live in a JSON field, unlike location homepage
  // Payload blocks. Payload therefore cannot mint their row ids for us.
  const block = { ...parsed.block, id: randomUUID() }
  const blocks = [...getDraftPageBlocks(doc), block]
  const formatted = await updateAndFormatMainHomepageBlocks(payload, blocks)

  return { status: 201, body: formatted }
}
