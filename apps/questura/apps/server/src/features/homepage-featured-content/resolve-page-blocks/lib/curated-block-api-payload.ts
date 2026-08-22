import { publicArticleGridFourLayout } from '../../article-grid/service'
import {
  publicFeaturedArticlesSlot3Layout,
  publicFeaturedArticlesSlot4Layout,
  publicFeaturedArticlesSlot5Layout,
} from '../../featured-articles/lib/slot-layouts'
import { publicLocationGridMediaAspect } from '../../location-grid/lib/media-aspect'
import { publicCreatorKicker } from '../../featured-creator-article/creator-kicker'

import type { ApiCuratedBlock } from '../types'

import {
  homepageBlockSupportsSectionHeading,
  publicFeaturedArticlesSectionHeading,
  publicFeaturedArticlesSectionSubheading,
} from './section-heading'

export function curatedBlockApiPayload(block: ApiCuratedBlock, selection: unknown) {
  if (homepageBlockSupportsSectionHeading(block.blockType)) {
    const base = {
      id: block.id,
      blockType: block.blockType,
      selection,
      sectionHeading: publicFeaturedArticlesSectionHeading(block),
      sectionSubheading: publicFeaturedArticlesSectionSubheading(block),
    }
    if (block.blockType === 'featured-articles') {
      const totalSlots =
        typeof selection === 'object' && selection !== null && 'totalSlots' in selection
          ? Number((selection as { totalSlots: number }).totalSlots)
          : 0
      return {
        ...base,
        slot3Layout: publicFeaturedArticlesSlot3Layout(block, totalSlots),
        slot4Layout: publicFeaturedArticlesSlot4Layout(block, totalSlots),
        slot5Layout: publicFeaturedArticlesSlot5Layout(block, totalSlots),
      }
    }
    if (block.blockType === 'featured-creator-article') {
      return {
        ...base,
        creatorKicker: publicCreatorKicker(block),
      }
    }
    if (block.blockType === 'location-grid') {
      return {
        ...base,
        mediaAspect: publicLocationGridMediaAspect(block),
      }
    }
    if (block.blockType === 'article-grid') {
      const totalSlots =
        typeof selection === 'object' && selection !== null && 'totalSlots' in selection
          ? Number((selection as { totalSlots: number }).totalSlots)
          : 0
      return {
        ...base,
        articleGridFourLayout: publicArticleGridFourLayout(block, totalSlots),
      }
    }
    return base
  }

  return { id: block.id, blockType: block.blockType, selection }
}
