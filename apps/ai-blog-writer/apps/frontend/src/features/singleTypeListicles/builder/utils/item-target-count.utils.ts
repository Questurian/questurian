import type { ListicleItemBlock, ListicleType } from '../../types'
import { getBlockTypeForListicleType } from '../../api'

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0)
}

function hasRichText(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  return Object.keys(value as Record<string, unknown>).length > 0
}

export function hasWrittenItemData(item: ListicleItemBlock): boolean {
  if (item.item !== null) return true
  if (item.selectedPhotos.length > 0) return true
  if (item.selectedInstagramPost !== null) return true
  if (hasText(item.blurbMarkdown)) return true
  if (hasText(item.blurbJsonText)) return true
  if (hasRichText(item.blurbLexical)) return true
  return false
}

export function hasAnyWrittenItemData(items: ListicleItemBlock[]): boolean {
  return items.some((item) => hasWrittenItemData(item))
}

export function isValidTargetItemCount(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= 50
}

export function normalizeTargetItemCount(
  targetItemCount: number,
  items: ListicleItemBlock[],
): number {
  if (items.length > 0) return items.length
  if (isValidTargetItemCount(targetItemCount)) return targetItemCount
  return 0
}

function createBlankListicleItem(blockType: ListicleItemBlock['blockType'], sequence: number): ListicleItemBlock {
  const now = Date.now()
  return {
    id: `item_${now}_${sequence}`,
    blockType,
    item: null,
    tours: [],
    mediaMode: 'photos',
    selectedPhotos: [],
    selectedInstagramPost: null,
    blurbMarkdown: '',
    blurbJsonText: '',
  }
}

export function resizeItemsToTargetCount(
  items: ListicleItemBlock[],
  targetItemCount: number,
  listicleType: ListicleType | '',
): ListicleItemBlock[] {
  if (!listicleType) return items

  if (targetItemCount <= 0) {
    return []
  }

  if (items.length === targetItemCount) {
    return items
  }

  if (items.length > targetItemCount) {
    return items.slice(0, targetItemCount)
  }

  const blockType = getBlockTypeForListicleType(listicleType)
  const extraCount = targetItemCount - items.length
  const appended = Array.from({ length: extraCount }, (_unused, index) =>
    createBlankListicleItem(blockType, index),
  )
  return [...items, ...appended]
}
