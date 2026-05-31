import { getPayload } from 'payload'

import config from '@/payload.config'
import type { PayloadInstance } from '@/types'
import { reorderBlocksByIds } from '@/shared/utils/reorder-blocks'

import {
  assertPublishableResolvedBlocks,
  augmentBlocksWithPublishStatus,
  snapshotDraftBlocksForPublish,
} from '../location-homepages/operations/publish-homepage'
import {
  assertFeaturedArticlesBlockConvertible,
  buildConvertedHomepageBlock,
  normalizeSlotCountForBlockType,
} from '../convert-empty-block/service'
import {
  formatHomepageDoc,
  parseNewBlockInput,
  resolvePageBlocks,
  type RawBlock,
} from '../resolve-page-blocks/service'
import {
  applyBlockFieldUpdates,
  applyBlockItemsUpdate,
} from '../location-homepage-blocks/lib/apply-block-update'
import {
  parseBlockUpdateBody,
  validateBlockUpdateFields,
} from '../location-homepage-blocks/lib/parse-block-update'
import {
  isCuratedBlockType,
} from '../resolve-page-blocks/service'
import {
  isValidRequestedSlotCount,
  resolveStoredSlotCountForBlockType,
} from '../slot-count/service'

type MainHomepageDoc = {
  id?: number
  draftPageBlocks?: unknown
  publishedPageBlocks?: unknown
  lastPublishedAt?: string | null
  lastPublishedBy?: unknown
  publishedRevision?: number | null
}

type OperationResult<TBody = unknown> = {
  status: number
  body: TBody
}

type ErrorBody = { message: string }

const MAIN_HOMEPAGE_LOCATION_GRID_SCOPE = {
  childLevel: 'city' as const,
  parentKey: null,
}

function rawBlocks(value: unknown): RawBlock[] {
  return Array.isArray(value) ? (value as RawBlock[]) : []
}

function getDraftPageBlocks(doc: MainHomepageDoc): RawBlock[] {
  return rawBlocks(doc.draftPageBlocks)
}

function getPublishedPageBlocks(doc: MainHomepageDoc): RawBlock[] {
  return rawBlocks(doc.publishedPageBlocks)
}

async function getMainHomepagePayload(): Promise<PayloadInstance> {
  return getPayload({ config })
}

async function loadMainHomepage(payload: PayloadInstance): Promise<MainHomepageDoc> {
  return (await payload.findGlobal({
    slug: 'main-homepage',
    depth: 0,
    overrideAccess: true,
  })) as unknown as MainHomepageDoc
}

async function updateMainHomepageDraft(
  payload: PayloadInstance,
  pageBlocks: unknown[],
): Promise<MainHomepageDoc> {
  return (await payload.updateGlobal({
    slug: 'main-homepage',
    data: { draftPageBlocks: pageBlocks } as never,
    depth: 0,
    overrideAccess: true,
  })) as unknown as MainHomepageDoc
}

async function resolveMainBlocks(payload: PayloadInstance, pageBlocks: RawBlock[]) {
  return resolvePageBlocks(payload, pageBlocks, MAIN_HOMEPAGE_LOCATION_GRID_SCOPE)
}

async function formatMainHomepage(
  payload: PayloadInstance,
  doc: MainHomepageDoc,
  pageBlocks = getDraftPageBlocks(doc),
) {
  const publishedRaw = getPublishedPageBlocks(doc)
  const resolvedBlocks = await resolveMainBlocks(payload, pageBlocks)
  const resolvedPublished = await resolveMainBlocks(payload, publishedRaw)
  const augmentedBlocks = augmentBlocksWithPublishStatus(resolvedBlocks, pageBlocks, publishedRaw)
  return {
    ...formatHomepageDoc(
      {
        id: 1,
        isEnabled: true,
        location: null,
        lastPublishedAt: doc.lastPublishedAt,
        lastPublishedBy: doc.lastPublishedBy,
        publishedRevision: doc.publishedRevision,
      },
      augmentedBlocks,
      { publishedPageBlocks: resolvedPublished },
    ),
    id: 1,
    location: null,
  }
}

export async function getMainHomepage(): Promise<OperationResult> {
  const payload = await getMainHomepagePayload()
  const doc = await loadMainHomepage(payload)
  return { status: 200, body: await formatMainHomepage(payload, doc) }
}

export async function updateMainHomepageBlockContent(
  body: unknown,
): Promise<OperationResult<Awaited<ReturnType<typeof formatMainHomepage>> | ErrorBody>> {
  const parsed = parseBlockUpdateBody(body)
  if (!parsed.ok) {
    return { status: parsed.status, body: { message: parsed.message } }
  }

  const payload = await getMainHomepagePayload()
  const doc = await loadMainHomepage(payload)
  const blocks = getDraftPageBlocks(doc)
  const blockIndex = blocks.findIndex((block) => block.id === parsed.input.blockId)

  if (blockIndex === -1) {
    return { status: 404, body: { message: `Block ${parsed.input.blockId} not found in main homepage.` } }
  }

  const block = blocks[blockIndex]
  if (!isCuratedBlockType(block.blockType)) {
    return {
      status: 400,
      body: { message: `Block type "${block.blockType}" does not support item updates via this endpoint.` },
    }
  }

  const fieldError = validateBlockUpdateFields(block, parsed.input.fields)
  if (fieldError) return { status: 400, body: { message: fieldError.message } }

  const resolvedBlockSlotCount = resolveStoredSlotCountForBlockType(block.blockType, block.slotCount)
  const blockSlotCount = parsed.input.slotCount ?? resolvedBlockSlotCount
  if (!isValidRequestedSlotCount(block.blockType, blockSlotCount)) {
    return {
      status: 400,
      body: { message: `slotCount ${blockSlotCount} is not supported for "${block.blockType}".` },
    }
  }

  const updatedBlocks = [...blocks]
  if (parsed.input.hasItems) {
    const itemUpdate = await applyBlockItemsUpdate(
      payload,
      block,
      parsed.input.items,
      blockSlotCount,
      MAIN_HOMEPAGE_LOCATION_GRID_SCOPE,
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

  const updated = await updateMainHomepageDraft(payload, updatedBlocks)
  return { status: 200, body: await formatMainHomepage(payload, updated) }
}

export async function addMainHomepageBlock(body: unknown): Promise<OperationResult> {
  const parsed = parseNewBlockInput(body)
  if (!parsed.ok) return { status: parsed.status, body: { message: parsed.message } }

  const payload = await getMainHomepagePayload()
  const doc = await loadMainHomepage(payload)
  const blocks = [...getDraftPageBlocks(doc), parsed.block]
  const updated = await updateMainHomepageDraft(payload, blocks)
  return { status: 201, body: await formatMainHomepage(payload, updated) }
}

export async function deleteMainHomepageBlock(
  body: unknown,
  leanResponse: boolean,
): Promise<OperationResult> {
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

export async function reorderMainHomepageBlocks(
  body: unknown,
  leanResponse: boolean,
): Promise<OperationResult> {
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

export async function convertMainHomepageBlock(
  body: unknown,
  leanResponse: boolean,
): Promise<OperationResult> {
  const input = body as { blockId?: unknown; blockType?: unknown; slotCount?: unknown } | null
  const blockId = typeof input?.blockId === 'string' ? input.blockId : ''
  const blockType = typeof input?.blockType === 'string' ? input.blockType : ''
  const slotCount = typeof input?.slotCount === 'number' ? input.slotCount : Number(input?.slotCount)

  if (!blockId || !blockType || !Number.isFinite(slotCount)) {
    return { status: 400, body: { message: 'blockId, blockType, and slotCount are required.' } }
  }

  const payload = await getMainHomepagePayload()
  const doc = await loadMainHomepage(payload)
  const blocks = getDraftPageBlocks(doc)
  const blockIndex = blocks.findIndex((block) => block.id === blockId)
  if (blockIndex === -1) return { status: 404, body: { message: `Block ${blockId} not found in main homepage.` } }

  const block = blocks[blockIndex]
  assertFeaturedArticlesBlockConvertible(block)
  const normalizedSlotCount = normalizeSlotCountForBlockType(blockType, slotCount)
  if (!isValidRequestedSlotCount(blockType, normalizedSlotCount)) {
    return {
      status: 400,
      body: { message: `slotCount ${normalizedSlotCount} is not supported for "${blockType}".` },
    }
  }

  const replacement = buildConvertedHomepageBlock(block, blockType, normalizedSlotCount) as RawBlock
  const updatedBlocks = [...blocks]
  updatedBlocks[blockIndex] = replacement
  const updated = await updateMainHomepageDraft(payload, updatedBlocks)

  if (leanResponse) {
    const [resolvedBlock] = await resolveMainBlocks(payload, [replacement])
    return { status: 200, body: { block: resolvedBlock } }
  }

  return { status: 200, body: await formatMainHomepage(payload, updated) }
}

export async function publishMainHomepage(
  userId: string | number | null,
): Promise<OperationResult> {
  const payload = await getMainHomepagePayload()
  const doc = await loadMainHomepage(payload)
  const draftBlocks = getDraftPageBlocks(doc)
  const resolvedDraftBlocks = await resolveMainBlocks(payload, draftBlocks)
  assertPublishableResolvedBlocks(resolvedDraftBlocks)

  const nextRevision = Math.max(0, Number(doc.publishedRevision) || 0) + 1
  const updated = (await payload.updateGlobal({
    slug: 'main-homepage',
    data: {
      publishedPageBlocks: snapshotDraftBlocksForPublish(draftBlocks),
      lastPublishedAt: new Date().toISOString(),
      lastPublishedBy: userId ?? undefined,
      publishedRevision: nextRevision,
    } as never,
    depth: 0,
    overrideAccess: true,
  })) as unknown as MainHomepageDoc

  return {
    status: 200,
    body: await formatMainHomepage(payload, updated, getPublishedPageBlocks(updated)),
  }
}

export { MAIN_HOMEPAGE_LOCATION_GRID_SCOPE, loadMainHomepage, getPublishedPageBlocks }
