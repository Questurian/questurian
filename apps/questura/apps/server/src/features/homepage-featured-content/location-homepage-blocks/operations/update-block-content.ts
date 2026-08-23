import {
  formatLocationHomepageWithResolvedBlocks,
  getDraftPageBlocks,
  getLocationHomepagePayload,
  loadLocationHomepage,
  updateLocationHomepage,
} from '../../location-homepages/lib/persistence'
import { validateAuthorFeatureCardImageSelections } from '../../author-feature/service'
import {
  isCuratedBlockType,
  resolveLocationGridScope,
  type RawBlock,
} from '../../resolve-page-blocks/service'
import {
  isValidRequestedSlotCount,
  resolveStoredSlotCountForBlockType,
} from '../../slot-count/service'
import { applyBlockFieldUpdates, applyBlockItemsUpdate } from '../lib/apply-block-update'
import { parseBlockUpdateBody, validateBlockUpdateFields } from '../lib/parse-block-update'
import type { FormattedLocationHomepage, LocationHomepageBlocksOperationResult } from '../types'

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
  const rawBlocks: RawBlock[] = getDraftPageBlocks(doc)
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

  const authorCards = parsed.input.fields.authorFeature.authorCards
  if (authorCards.ok && !authorCards.omit) {
    const authorImageError = await validateAuthorFeatureCardImageSelections(
      payload,
      authorCards.value,
    )
    if (authorImageError) return { status: 400, body: { message: authorImageError } }
  }

  const locationGridScope = await resolveLocationGridScope(payload, doc.location)
  const resolvedBlockSlotCount = resolveStoredSlotCountForBlockType(
    block.blockType,
    block.slotCount,
  )
  const blockSlotCount = parsed.input.slotCount ?? resolvedBlockSlotCount

  if (!isValidRequestedSlotCount(block.blockType, blockSlotCount)) {
    return {
      status: 400,
      body: {
        message: `slotCount ${blockSlotCount} is not supported for "${block.blockType}".`,
      },
    }
  }

  const updatedBlocks = [...rawBlocks]
  const blockWithFieldUpdates = applyBlockFieldUpdates(
    { ...block, slotCount: blockSlotCount },
    parsed.input.fields,
  )
  if (parsed.input.hasItems) {
    const itemUpdate = await applyBlockItemsUpdate(
      payload,
      blockWithFieldUpdates,
      parsed.input.items,
      blockSlotCount,
      locationGridScope,
    )

    if (!itemUpdate.ok) {
      return { status: itemUpdate.status, body: { message: itemUpdate.message } }
    }

    updatedBlocks[blockIndex] = itemUpdate.block
  } else {
    updatedBlocks[blockIndex] = blockWithFieldUpdates
  }

  const updated = await updateLocationHomepage(payload, id, updatedBlocks, 0)
  const formatted = await formatLocationHomepageWithResolvedBlocks(payload, updated)

  return { status: 200, body: formatted }
}
