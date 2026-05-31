import { resolvePageBlocks } from '../../resolve-page-blocks/service'
import type { RawBlock } from '../../resolve-page-blocks/service'

type ResolvedPageBlock = Awaited<ReturnType<typeof resolvePageBlocks>>[number]

/**
 * Publishability rules and per-block draft-vs-published status.
 *
 * This module is intentionally low-dependency (it only imports types from
 * `resolve-page-blocks`) so it can be shared by the publish guard, the location
 * homepage formatter, and the main homepage Global without creating import cycles.
 */

const ARTICLE_BLOCK_TYPES = new Set([
  'featured-article',
  'featured-article-carousel',
  'featured-articles',
  'article-grid',
  'questurian-maps',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'article-list',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isReadyImage(value: unknown): boolean {
  return isRecord(value) && text(value.url) !== '' && value.status === 'ready'
}

function requiredImageField(block: Record<string, unknown>, slotIndex: number): string {
  if (block.blockType === 'featured-article') return 'imageHero'

  if (block.blockType === 'featured-articles') {
    return slotIndex === 0 ? 'imageHero' : 'image'
  }

  if (block.blockType === 'article-grid') {
    const totalSlots = Number(isRecord(block.selection) ? block.selection.totalSlots : 0)
    const layout = text(block.articleGridFourLayout)
    return totalSlots === 8 || layout === 'two-by-two' ? 'imageSquare' : 'image'
  }

  return 'image'
}

/**
 * Returns the reasons a single resolved block cannot be published. Empty array = publishable.
 * Single source of truth for publishability rules, reused by the publish guard (throws the
 * first reason) and the editor formatter (per-block "Won't publish" badge).
 */
export function getBlockPublishBlockers(block: unknown, blockIndex: number): string[] {
  const blockers: string[] = []
  if (!isRecord(block)) return blockers

  const selection = isRecord(block.selection) ? block.selection : null
  if (!selection) return blockers

  if (selection.isComplete !== true) {
    blockers.push(`Block ${blockIndex + 1} is incomplete or contains invalid references.`)
    return blockers
  }

  if (!ARTICLE_BLOCK_TYPES.has(text(block.blockType))) return blockers

  const items = Array.isArray(selection.items) ? selection.items : []
  for (const [slotIndex, item] of items.entries()) {
    if (!isRecord(item)) {
      blockers.push(`Block ${blockIndex + 1}, slot ${slotIndex + 1} is invalid.`)
      continue
    }

    if (item.status !== 'published') {
      const title = text(item.title) || `${text(item.collectionLabel) || 'Item'} #${item.id}`
      blockers.push(`Block ${blockIndex + 1}, slot ${slotIndex + 1} (${title}) is not published.`)
      continue
    }

    const imageField = requiredImageField(block, slotIndex)
    if (!isReadyImage(item[imageField])) {
      const title = text(item.title) || `${text(item.collectionLabel) || 'Item'} #${item.id}`
      blockers.push(
        `Block ${blockIndex + 1}, slot ${slotIndex + 1} (${title}) is missing a ready ${imageField} placement.`,
      )
    }
  }

  return blockers
}

export function assertPublishableResolvedBlocks(resolvedBlocks: unknown[]): void {
  for (const [blockIndex, block] of resolvedBlocks.entries()) {
    const blockers = getBlockPublishBlockers(block, blockIndex)
    if (blockers.length > 0) {
      throw new Error(blockers[0])
    }
  }
}

/**
 * Deep clone for the published snapshot, stripping every `id` (Payload mints fresh ids
 * for the published array on write).
 */
export function cloneBlocksForPublishedSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneBlocksForPublishedSnapshot(item))
  }

  if (isRecord(value)) {
    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (key === 'id') continue
      next[key] = cloneBlocksForPublishedSnapshot(child)
    }
    return next
  }

  return value
}

/**
 * Snapshot the top-level draft blocks for the published copy. Each published row records
 * the draft block's stable `id` as `sourceBlockKey` so the editor can match a draft block
 * to its published counterpart.
 */
export function snapshotDraftBlocksForPublish(blocks: unknown): unknown[] {
  if (!Array.isArray(blocks)) return []
  return blocks.map((block) => {
    const cloned = cloneBlocksForPublishedSnapshot(block)
    if (isRecord(block) && isRecord(cloned) && block.id != null) {
      ;(cloned as Record<string, unknown>).sourceBlockKey = String(block.id)
    }
    return cloned
  })
}

export type BlockPublishStatus = 'live' | 'modified' | 'unpublished'
export type BlockValidationStatus = 'publishable' | 'blocked'

/** Stable, order-independent serialization for content comparison (ignores volatile keys). */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item))
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      if (key === 'id' || key === 'sourceBlockKey') continue
      out[key] = canonicalize(record[key])
    }
    return out
  }

  return value
}

function sameContent(a: RawBlock, b: RawBlock): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b))
}

/**
 * Attaches `publishStatus`, `validationStatus`, and `publishBlockers` to each resolved draft
 * block. `resolvedDraft` and `rawDraft` are index-aligned (both produced from the same draft
 * array). Published blocks are matched by `sourceBlockKey === String(draftBlock.id)`.
 */
export function augmentBlocksWithPublishStatus(
  resolvedDraft: ResolvedPageBlock[],
  rawDraft: RawBlock[],
  rawPublished: RawBlock[],
): ResolvedPageBlock[] {
  const publishedByKey = new Map<string, RawBlock>()
  for (const published of rawPublished) {
    const key = text((published as Record<string, unknown>).sourceBlockKey)
    if (key) publishedByKey.set(key, published)
  }

  return resolvedDraft.map((resolved, index) => {
    const raw = rawDraft[index]
    const draftKey = raw?.id != null ? String(raw.id) : ''
    const publishedMatch = draftKey ? publishedByKey.get(draftKey) : undefined

    let publishStatus: BlockPublishStatus
    if (!publishedMatch) {
      publishStatus = 'unpublished'
    } else if (raw && sameContent(raw, publishedMatch)) {
      publishStatus = 'live'
    } else {
      publishStatus = 'modified'
    }

    const publishBlockers = getBlockPublishBlockers(resolved, index)
    const validationStatus: BlockValidationStatus =
      publishBlockers.length > 0 ? 'blocked' : 'publishable'

    return {
      ...resolved,
      publishStatus,
      validationStatus,
      publishBlockers,
    }
  })
}
