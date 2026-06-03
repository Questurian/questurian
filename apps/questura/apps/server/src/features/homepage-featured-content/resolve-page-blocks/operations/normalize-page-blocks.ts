import type { PayloadRequest } from 'payload'

import { APP_CONFIG } from '@/shared/config'

import { curatedBlockRegistry } from '../../block-registry'
import type { LocationGridScope } from '../../location-grid/types'
import { resolveStoredSlotCountForBlockType } from '../../slot-count/service'

type NormalizePageBlocksOptions = {
  originalPageBlocks?: unknown[]
}

/**
 * Mutates block `items` in place for curated blocks (same as Payload beforeValidate).
 *
 * The per-type work — slot-count resolution, pre-validate record defaults, scope checks,
 * and normalize → validate → build — is driven by each block's registry `behavior`, so
 * adding a block type touches only `block-registry/`, never this dispatcher.
 *
 * @param locationGridScope — child-location scope for location homepages
 */
export async function normalizePageBlocksArrayInPlace(
  req: PayloadRequest,
  pageBlocks: unknown[],
  locationGridScope: LocationGridScope | null,
  options: NormalizePageBlocksOptions = {},
): Promise<void> {
  const originalBlocksById = new Map<string, Record<string, unknown>>()
  for (const originalBlock of options.originalPageBlocks ?? []) {
    if (typeof originalBlock !== 'object' || originalBlock === null) continue
    const originalRecord = originalBlock as Record<string, unknown>
    if (typeof originalRecord.id === 'string' && originalRecord.id.trim()) {
      originalBlocksById.set(originalRecord.id, originalRecord)
    }
  }

  for (const block of pageBlocks) {
    if (typeof block !== 'object' || block === null) continue

    const blockRecord = block as Record<string, unknown>
    const definition = curatedBlockRegistry.get(String(blockRecord.blockType))
    if (!definition) continue

    const { behavior } = definition
    const shouldValidateBlock = shouldValidatePageBlock(blockRecord, originalBlocksById)

    const slotCount = resolveStoredSlotCountForBlockType(
      String(blockRecord.blockType),
      blockRecord.slotCount,
    )
    blockRecord.slotCount = slotCount

    behavior.prepareRecord?.(blockRecord, slotCount)

    const context = {
      payload: req.payload,
      slotCount,
      allowDrafts: APP_CONFIG.features.homepageFeaturedAllowDrafts,
      locationGridScope,
    }

    if (shouldValidateBlock) {
      behavior.assertAllowed?.(context)
    }

    if (behavior.clearsItems) {
      blockRecord.items = []
      continue
    }

    if (
      !shouldValidateBlock
      || !behavior.buildStoredItems
      || !Array.isArray(blockRecord.items)
      || blockRecord.items.length === 0
    ) {
      continue
    }

    blockRecord.items = await behavior.buildStoredItems(blockRecord.items, context)
  }
}

function shouldValidatePageBlock(
  block: Record<string, unknown>,
  originalBlocksById: Map<string, Record<string, unknown>>,
): boolean {
  if (typeof block.id !== 'string' || !block.id.trim()) {
    return true
  }

  const original = originalBlocksById.get(block.id)
  if (!original) {
    return true
  }

  return stableStringify({
    blockType: block.blockType,
    slotCount: block.slotCount,
    items: block.items,
  }) !== stableStringify({
    blockType: original.blockType,
    slotCount: original.slotCount,
    items: original.items,
  })
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}
