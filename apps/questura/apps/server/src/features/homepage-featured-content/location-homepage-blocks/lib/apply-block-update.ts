import { APP_CONFIG } from '@/shared/config'
import type { PayloadInstance } from '@/types'

import {
  assertAuthorFeatureItemsMatchAuthors,
  authorIdsFromAuthorFeatureBlock,
} from '../../author-feature/service'
import { curatedBlockRegistry } from '../../block-registry'
import { normalizeHomepageFeaturedInput } from '../../featured-articles/service'
import type { LocationGridScope } from '../../location-grid/types'
import {
  normalizeLocationGridDescriptions,
  normalizeLocationGridKickers,
} from '../../location-grid/service'
import type { RawBlock } from '../../resolve-page-blocks/service'
import type { ParsedBlockUpdateFields } from './parse-block-update'

type ApplyBlockItemsResult =
  | { ok: true; block: RawBlock }
  | { ok: false; status: number; message: string }

export async function applyBlockItemsUpdate(
  payload: PayloadInstance,
  block: RawBlock,
  items: unknown[],
  blockSlotCount: number,
  locationGridScope: LocationGridScope | null,
): Promise<ApplyBlockItemsResult> {
  const definition = curatedBlockRegistry.get(block.blockType)
  const behavior = definition?.behavior

  if (!behavior?.buildStoredItems || behavior.clearsItems) {
    return {
      ok: false,
      status: 400,
      message: `"${block.blockType}" blocks do not support item updates.`,
    }
  }

  const context = {
    payload,
    slotCount: blockSlotCount,
    allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
    locationGridScope,
    block,
  }

  behavior.assertAllowed?.(context)
  const storedItems = await behavior.buildStoredItems(items, context)
  const locationGridFields =
    block.blockType === 'location-grid'
      ? {
          itemKickers: normalizeLocationGridKickers(items),
          itemDescriptions: normalizeLocationGridDescriptions(items),
        }
      : {}
  return {
    ok: true,
    block: {
      ...block,
      slotCount: blockSlotCount,
      items: storedItems,
      ...locationGridFields,
    },
  }
}

export function applyBlockFieldUpdates(block: RawBlock, fields: ParsedBlockUpdateFields): RawBlock {
  let next = block

  if (!fields.sectionHeading.omit) {
    next = { ...next, sectionHeading: fields.sectionHeading.value }
  }
  if (!fields.sectionSubheading.omit) {
    next = { ...next, sectionSubheading: fields.sectionSubheading.value }
  }
  if (!fields.slot3Layout.omit) {
    next = { ...next, slot3Layout: fields.slot3Layout.value }
  }
  if (!fields.slot4Layout.omit) {
    next = { ...next, slot4Layout: fields.slot4Layout.value }
  }
  if (!fields.slot5Layout.omit) {
    next = { ...next, slot5Layout: fields.slot5Layout.value }
  }
  if (!fields.mediaAspect.omit) {
    next = { ...next, mediaAspect: fields.mediaAspect.value }
  }
  if (!fields.articleGridFourLayout.omit) {
    next = { ...next, articleGridFourLayout: fields.articleGridFourLayout.value }
  }
  if (!fields.creatorKicker.omit) {
    next = { ...next, creatorKicker: fields.creatorKicker.value }
  }
  for (const [key, field] of Object.entries(fields.editorialFeature)) {
    if (!field.omit) next = { ...next, [key]: field.value }
  }
  for (const [key, field] of Object.entries(fields.authorFeature)) {
    if (!field.omit) next = { ...next, [key]: field.value }
  }

  return next
}

export async function validateUpdatedAuthorFeatureItems(
  payload: PayloadInstance,
  block: RawBlock,
  items: unknown,
): Promise<string | null> {
  if (block.blockType !== 'author-feature') return null

  try {
    await assertAuthorFeatureItemsMatchAuthors(
      payload,
      normalizeHomepageFeaturedInput(items),
      authorIdsFromAuthorFeatureBlock(block),
    )
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Author Feature articles are invalid.'
  }
}
