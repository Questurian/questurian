import { PUBLIC_ARTICLE_BLOCK_TYPES } from '../constants'
import { formatPublicArticleItem } from './format-public-article'
import { isRecord } from './guards'
import { normalizeTotalSlots, stringOrNull } from './normalize'

export function formatPublicHomepageBlock(block: unknown) {
  if (!isRecord(block) || !PUBLIC_ARTICLE_BLOCK_TYPES.has(String(block.blockType))) {
    return block
  }

  const selection = isRecord(block.selection) ? block.selection : null
  const rawItems = Array.isArray(selection?.items) ? selection.items : []

  return {
    blockType: String(block.blockType),
    totalSlots: normalizeTotalSlots(selection?.totalSlots),
    sectionHeading: stringOrNull(block.sectionHeading),
    sectionSubheading: stringOrNull(block.sectionSubheading),
    items: rawItems.map((item) => formatPublicArticleItem(item)),
  }
}
