import { publicFeaturedArticlesSlot3Layout } from '../../featured-articles/lib/slot-layouts'
import { PUBLIC_ARTICLE_BLOCK_TYPES } from '../constants'
import { formatPublicArticleItem } from './format-public-article'
import { isRecord } from './guards'
import { normalizeTotalSlots, stringOrNull } from './normalize'

type LocationContext = { country: string; city: string }

export function formatPublicHomepageBlock(block: unknown, location?: LocationContext) {
  if (!isRecord(block) || !PUBLIC_ARTICLE_BLOCK_TYPES.has(String(block.blockType))) {
    return block
  }

  const selection = isRecord(block.selection) ? block.selection : null
  if (selection?.isComplete === false) {
    return null
  }

  const rawItems = Array.isArray(selection?.items) ? selection.items : []
  const blockType = String(block.blockType)
  const totalSlots = normalizeTotalSlots(selection?.totalSlots)

  const base = {
    blockType,
    totalSlots,
    sectionHeading: stringOrNull(block.sectionHeading),
    sectionSubheading: stringOrNull(block.sectionSubheading),
    items: rawItems.map((item) => formatPublicArticleItem(item, location)),
  }

  const slot3Layout =
    blockType === 'featured-articles'
      ? publicFeaturedArticlesSlot3Layout(block, totalSlots)
      : null

  if (slot3Layout) {
    return { ...base, slot3Layout }
  }

  return base
}
