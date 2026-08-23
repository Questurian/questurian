import type {
  ArticleCuratedHomepageBlockResponse,
  ArticleGridBlockResponse,
  ArticleGridFourLayout,
  FeaturedArticlesBlockResponse,
  FeaturedArticlesSlot3Layout,
  FeaturedArticlesSlot4Layout,
  FeaturedArticlesSlot5Layout
} from './pageBlocks'

export function slot3LayoutForBlock(
  block: ArticleCuratedHomepageBlockResponse
): FeaturedArticlesSlot3Layout {
  if (
    block.blockType !== 'featured-articles' ||
    block.selection.totalSlots !== 3
  ) {
    return 'hero-left'
  }
  return (block as FeaturedArticlesBlockResponse).slot3Layout ?? 'hero-left'
}

export function slot4LayoutForBlock(
  block: ArticleCuratedHomepageBlockResponse
): FeaturedArticlesSlot4Layout {
  if (
    block.blockType !== 'featured-articles' ||
    block.selection.totalSlots !== 4
  ) {
    return 'sidebar-stack'
  }
  return (block as FeaturedArticlesBlockResponse).slot4Layout ?? 'sidebar-stack'
}

export function slot5LayoutForBlock(
  block: ArticleCuratedHomepageBlockResponse
): FeaturedArticlesSlot5Layout {
  if (
    block.blockType !== 'featured-articles' ||
    block.selection.totalSlots !== 5
  ) {
    return 'card-grid'
  }
  return (block as FeaturedArticlesBlockResponse).slot5Layout ?? 'card-grid'
}

export function articleGridFourLayoutForBlock(
  block: ArticleCuratedHomepageBlockResponse
): ArticleGridFourLayout {
  if (block.blockType !== 'article-grid' || block.selection.totalSlots !== 4) {
    return 'four-across'
  }
  return (
    (block as ArticleGridBlockResponse).articleGridFourLayout ?? 'four-across'
  )
}
