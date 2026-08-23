import {
  applyBlockFieldUpdates,
  applyBlockItemsUpdate,
} from '../../location-homepage-blocks/lib/apply-block-update'
import { validateAuthorFeatureCardImageSelections } from '../../author-feature/service'
import {
  parseBlockUpdateBody,
  validateBlockUpdateFields,
} from '../../location-homepage-blocks/lib/parse-block-update'
import { isCuratedBlockType } from '../../resolve-page-blocks/service'
import {
  isValidRequestedSlotCount,
  resolveStoredSlotCountForBlockType,
} from '../../slot-count/service'
import {
  MAIN_HOMEPAGE_LOCATION_GRID_SCOPE,
  formatMainHomepage,
  getDraftPageBlocks,
  getMainHomepagePayload,
  loadMainHomepage,
  updateMainHomepageDraft,
} from '../lib/persistence'
import type { MainHomepageErrorBody, MainHomepageOperationResult } from '../types'

export async function updateMainHomepageBlockContent(
  body: unknown,
): Promise<
  MainHomepageOperationResult<
    Awaited<ReturnType<typeof formatMainHomepage>> | MainHomepageErrorBody
  >
> {
  const parsed = parseBlockUpdateBody(body)
  if (!parsed.ok) {
    return { status: parsed.status, body: { message: parsed.message } }
  }

  const payload = await getMainHomepagePayload()
  const doc = await loadMainHomepage(payload)
  const blocks = getDraftPageBlocks(doc)
  const blockIndex = blocks.findIndex((block) => block.id === parsed.input.blockId)

  if (blockIndex === -1) {
    return {
      status: 404,
      body: { message: `Block ${parsed.input.blockId} not found in main homepage.` },
    }
  }

  const block = blocks[blockIndex]
  if (!isCuratedBlockType(block.blockType)) {
    return {
      status: 400,
      body: {
        message: `Block type "${block.blockType}" does not support item updates via this endpoint.`,
      },
    }
  }

  const fieldError = validateBlockUpdateFields(block, parsed.input.fields)
  if (fieldError) return { status: 400, body: { message: fieldError.message } }

  const authorCards = parsed.input.fields.authorFeature.authorCards
  if (authorCards.ok && !authorCards.omit) {
    const authorImageError = await validateAuthorFeatureCardImageSelections(
      payload,
      authorCards.value,
    )
    if (authorImageError) return { status: 400, body: { message: authorImageError } }
  }

  const resolvedBlockSlotCount = resolveStoredSlotCountForBlockType(
    block.blockType,
    block.slotCount,
  )
  const blockSlotCount = parsed.input.slotCount ?? resolvedBlockSlotCount
  if (!isValidRequestedSlotCount(block.blockType, blockSlotCount)) {
    return {
      status: 400,
      body: { message: `slotCount ${blockSlotCount} is not supported for "${block.blockType}".` },
    }
  }

  const updatedBlocks = [...blocks]
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
      MAIN_HOMEPAGE_LOCATION_GRID_SCOPE,
    )
    if (!itemUpdate.ok) {
      return { status: itemUpdate.status, body: { message: itemUpdate.message } }
    }
    updatedBlocks[blockIndex] = itemUpdate.block
  } else {
    updatedBlocks[blockIndex] = blockWithFieldUpdates
  }

  const updated = await updateMainHomepageDraft(payload, updatedBlocks)
  return { status: 200, body: await formatMainHomepage(payload, updated) }
}
