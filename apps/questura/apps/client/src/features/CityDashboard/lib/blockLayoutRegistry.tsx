import type { ComponentType } from 'react'

import type {
  CityHomepageBlock,
  FeaturedArticlesBlock,
  HomepageBlockLayoutDefinition,
  HomepageBlockLayoutKey,
  HomepageBlockLayoutProps,
} from '../types'
import { FeaturedArticlesEightArticlePreview } from '../components/blocks/featured-articles/FeaturedArticlesEightArticlePreview'
import { FeaturedArticlesSevenArticlePreview } from '../components/blocks/featured-articles/FeaturedArticlesSevenArticlePreview'

function homepageBlockLayoutKey(blockType: string, totalSlots: number): HomepageBlockLayoutKey {
  return `${blockType}:${totalSlots}`
}

export function defineHomepageBlockLayout<TBlock extends CityHomepageBlock>(
  definition: Omit<HomepageBlockLayoutDefinition, 'Component'> & {
    Component: ComponentType<HomepageBlockLayoutProps<TBlock>>
  },
): HomepageBlockLayoutDefinition {
  return definition as HomepageBlockLayoutDefinition
}

export function getHomepageBlockTotalSlots(block: CityHomepageBlock): number | null {
  const totalSlots = 'totalSlots' in block ? block.totalSlots : block.selection?.totalSlots

  if (typeof totalSlots !== 'number' || !Number.isInteger(totalSlots) || totalSlots < 0) {
    return null
  }

  return totalSlots
}

// Register block layout implementations here as each block type is built.
const homepageBlockLayouts: HomepageBlockLayoutDefinition[] = [
  defineHomepageBlockLayout<FeaturedArticlesBlock>({
    blockType: 'featured-articles',
    totalSlots: 7,
    Component: FeaturedArticlesSevenArticlePreview,
  }),
  defineHomepageBlockLayout<FeaturedArticlesBlock>({
    blockType: 'featured-articles',
    totalSlots: 8,
    Component: FeaturedArticlesEightArticlePreview,
  }),
]

const homepageBlockLayoutMap = new Map<HomepageBlockLayoutKey, HomepageBlockLayoutDefinition>(
  homepageBlockLayouts.map((layout) => [
    homepageBlockLayoutKey(layout.blockType, layout.totalSlots),
    layout,
  ]),
)

export function getHomepageBlockLayout(
  block: CityHomepageBlock,
): HomepageBlockLayoutDefinition | null {
  const totalSlots = getHomepageBlockTotalSlots(block)

  if (totalSlots === null) {
    return null
  }

  return homepageBlockLayoutMap.get(homepageBlockLayoutKey(block.blockType, totalSlots)) ?? null
}
