import type { ComponentType } from 'react'

import type {
  CityHomepageBlock,
  FeaturedArticlesBlock,
  HotelGridBlock,
  HomepageBlockLayoutDefinition,
  HomepageBlockLayoutFallbackDefinition,
  HomepageBlockLayoutKey,
  HomepageBlockLayoutProps,
} from '../types'
import { FeaturedArticlesEightArticlePreview } from '../components/blocks/featured-articles/FeaturedArticlesEightArticlePreview'
import { FeaturedArticlesSevenArticlePreview } from '../components/blocks/featured-articles/FeaturedArticlesSevenArticlePreview'
import { HotelGridPreview } from '../components/blocks/hotel-grid/HotelGridPreview'

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

export function defineHomepageBlockLayoutAnySlots<TBlock extends CityHomepageBlock>(
  definition: Omit<HomepageBlockLayoutFallbackDefinition, 'Component'> & {
    Component: ComponentType<HomepageBlockLayoutProps<TBlock>>
  },
): HomepageBlockLayoutFallbackDefinition {
  return definition as HomepageBlockLayoutFallbackDefinition
}

export function getHomepageBlockTotalSlots(block: CityHomepageBlock): number | null {
  const totalSlots = 'totalSlots' in block ? block.totalSlots : block.selection?.totalSlots

  if (typeof totalSlots !== 'number' || !Number.isInteger(totalSlots) || totalSlots < 0) {
    return null
  }

  return totalSlots
}

// Exact match: blockType + specific totalSlots
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

// Fallback: blockType only — matches any slot count not covered above
const homepageBlockFallbackLayouts: HomepageBlockLayoutFallbackDefinition[] = [
  defineHomepageBlockLayoutAnySlots<HotelGridBlock>({
    blockType: 'hotel-grid',
    Component: HotelGridPreview,
  }),
]

const homepageBlockFallbackMap = new Map<string, HomepageBlockLayoutFallbackDefinition>(
  homepageBlockFallbackLayouts.map((layout) => [layout.blockType, layout]),
)

export function getHomepageBlockLayout(
  block: CityHomepageBlock,
): HomepageBlockLayoutDefinition | HomepageBlockLayoutFallbackDefinition | null {
  const totalSlots = getHomepageBlockTotalSlots(block)

  if (totalSlots !== null) {
    const exact = homepageBlockLayoutMap.get(homepageBlockLayoutKey(block.blockType, totalSlots))
    if (exact) return exact
  }

  return homepageBlockFallbackMap.get(block.blockType) ?? null
}
