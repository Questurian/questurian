import {
  formatLocationHomepageWithResolvedBlocks,
  getLocationHomepagePayload,
  loadLocationHomepage,
  updateLocationHomepage,
} from '../../location-homepages/lib/persistence'
import {
  isCuratedBlockType,
  resolveLocationGridScope,
  type RawBlock,
} from '../../resolve-page-blocks/service'
import { resolveStoredSlotCountForBlockType } from '../../slot-count/service'
import {
  applyBlockFieldUpdates,
  applyBlockItemsUpdate,
} from '../lib/apply-block-update'
import {
  parseBlockUpdateBody,
  validateBlockUpdateFields,
} from '../lib/parse-block-update'
import type {
  FormattedLocationHomepage,
  LocationHomepageBlocksOperationResult,
} from '../types'

type ErrorBody = { message: string }

export async function updateLocationHomepageBlockContent(
  id: string,
  body: unknown,
): Promise<LocationHomepageBlocksOperationResult<FormattedLocationHomepage | ErrorBody>> {
  const parsed = parseBlockUpdateBody(body)
  if (!parsed.ok) {
    return { status: parsed.status, body: { message: parsed.message } }
  }

  const payload = await getLocationHomepagePayload()
  const doc = await loadLocationHomepage(payload, id, 0)
  const rawBlocks: RawBlock[] = doc.pageBlocks ?? []
  const blockIndex = rawBlocks.findIndex((block) => block.id === parsed.input.blockId)

  if (blockIndex === -1) {
    return {
      status: 404,
      body: { message: `Block ${parsed.input.blockId} not found in this homepage.` },
    }
  }

  const block = rawBlocks[blockIndex]

  if (!isCuratedBlockType(block.blockType)) {
    return {
      status: 400,
      body: {
        message: `Block type "${block.blockType}" does not support item updates via this endpoint.`,
      },
    }
  }

  const fieldError = validateBlockUpdateFields(block, parsed.input.fields)
  if (fieldError) {
    return { status: 400, body: { message: fieldError.message } }
  }

  const locationGridScope = await resolveLocationGridScope(payload, doc.location)
  const blockSlotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
  const updatedBlocks = [...rawBlocks]

  if (parsed.input.hasItems) {
    const itemUpdate = await applyBlockItemsUpdate(
      payload,
      block,
      parsed.input.items,
      blockSlotCount,
      locationGridScope,
    )

    if (!itemUpdate.ok) {
      return { status: itemUpdate.status, body: { message: itemUpdate.message } }
    }

    updatedBlocks[blockIndex] = applyBlockFieldUpdates(itemUpdate.block, parsed.input.fields)
  } else {
    updatedBlocks[blockIndex] = applyBlockFieldUpdates(
      { ...block, slotCount: blockSlotCount },
      parsed.input.fields,
    )
  }

  const updated = await updateLocationHomepage(payload, id, updatedBlocks, 0)
  const formatted = await formatLocationHomepageWithResolvedBlocks(payload, updated)

  return { status: 200, body: formatted }
}
