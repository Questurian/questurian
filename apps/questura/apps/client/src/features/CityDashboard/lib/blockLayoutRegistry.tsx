import type { ComponentType } from 'react'

import type {
  ArticleGridBlock,
  CityHomepageBlock,
  CityHomepageArticleBlock,
  FeaturedArticlesBlock,
  HotelGridBlock,
  TourGridBlock,
  LocationGridBlock,
  NewsletterSignupBlock,
  ThingsToDoAttractionsBlock,
  HomepageBlockLayoutDefinition,
  HomepageBlockLayoutFallbackDefinition,
  HomepageBlockLayoutKey,
  HomepageBlockLayoutProps,
} from '../types'
import { FeaturedArticleOneArticlePreview } from '../components/blocks/featured-article/FeaturedArticleOneArticlePreview'
import { FeaturedArticleCarouselPreview } from '../components/blocks/featured-article-carousel/FeaturedArticleCarouselPreview'
import { FeaturedArticlesEightArticlePreview } from '../components/blocks/featured-articles/FeaturedArticlesEightArticlePreview'
import { FeaturedArticlesFiveArticlePreview } from '../components/blocks/featured-articles/FeaturedArticlesFiveArticlePreview'
import { FeaturedArticlesFourArticlePreview } from '../components/blocks/featured-articles/FeaturedArticlesFourArticlePreview'
import { FeaturedArticlesNineArticlePreview } from '../components/blocks/featured-articles/FeaturedArticlesNineArticlePreview'
import { FeaturedArticlesThreeArticlePreview } from '../components/blocks/featured-articles/FeaturedArticlesThreeArticlePreview'
import { FeaturedArticlesSevenArticlePreview } from '../components/blocks/featured-articles/FeaturedArticlesSevenArticlePreview'
import { ArticleGridPreview } from '../components/blocks/article-grid/ArticleGridPreview'
import { HotelGridPreview } from '../components/blocks/hotel-grid/HotelGridPreview'
import { ThingsToDoAttractionsPreview } from '../components/blocks/things-to-do-attractions/ThingsToDoAttractionsPreview'
import { TourGridPreview } from '../components/blocks/tour-grid/TourGridPreview'
import { LocationGridPreview } from '../components/blocks/location-grid/LocationGridPreview'
import { QuestUrianMapsPreview } from '../components/blocks/questurian-maps/QuestUrianMapsPreview'
import { ArticleListPreview } from '../components/blocks/article-list/ArticleListPreview'
import { NewsletterSignupPreview } from '../components/blocks/newsletter-signup/NewsletterSignupPreview'

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
    totalSlots: 3,
    Component: FeaturedArticlesThreeArticlePreview,
  }),
  defineHomepageBlockLayout<FeaturedArticlesBlock>({
    blockType: 'featured-articles',
    totalSlots: 4,
    Component: FeaturedArticlesFourArticlePreview,
  }),
  defineHomepageBlockLayout<FeaturedArticlesBlock>({
    blockType: 'featured-articles',
    totalSlots: 5,
    Component: FeaturedArticlesFiveArticlePreview,
  }),
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
  defineHomepageBlockLayout<FeaturedArticlesBlock>({
    blockType: 'featured-articles',
    totalSlots: 9,
    Component: FeaturedArticlesNineArticlePreview,
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
  defineHomepageBlockLayoutAnySlots<CityHomepageArticleBlock>({
    blockType: 'featured-article',
    Component: FeaturedArticleOneArticlePreview,
  }),
  defineHomepageBlockLayoutAnySlots<CityHomepageArticleBlock>({
    blockType: 'featured-article-carousel',
    Component: FeaturedArticleCarouselPreview,
  }),
  defineHomepageBlockLayoutAnySlots<ArticleGridBlock>({
    blockType: 'article-grid',
    Component: ArticleGridPreview,
  }),
  defineHomepageBlockLayoutAnySlots<HotelGridBlock>({
    blockType: 'hotel-grid',
    Component: HotelGridPreview,
  }),
  // Article-teaser carousels: same public payload shape as the featured
  // article carousel, so they share its layout component.
  defineHomepageBlockLayoutAnySlots<CityHomepageArticleBlock>({
    blockType: 'where-to-eat-drink',
    Component: FeaturedArticleCarouselPreview,
  }),
  defineHomepageBlockLayoutAnySlots<CityHomepageArticleBlock>({
    blockType: 'things-to-do-listicles',
    Component: FeaturedArticleCarouselPreview,
  }),
  defineHomepageBlockLayoutAnySlots<ThingsToDoAttractionsBlock>({
    blockType: 'things-to-do-attractions',
    Component: ThingsToDoAttractionsPreview,
  }),
  defineHomepageBlockLayoutAnySlots<TourGridBlock>({
    blockType: 'tour-grid',
    Component: TourGridPreview,
  }),
  defineHomepageBlockLayoutAnySlots<LocationGridBlock>({
    blockType: 'location-grid',
    Component: LocationGridPreview,
  }),
  defineHomepageBlockLayoutAnySlots<CityHomepageArticleBlock>({
    blockType: 'questurian-maps',
    Component: QuestUrianMapsPreview,
  }),
  defineHomepageBlockLayoutAnySlots<CityHomepageArticleBlock>({
    blockType: 'article-list',
    Component: ArticleListPreview,
  }),
  defineHomepageBlockLayoutAnySlots<NewsletterSignupBlock>({
    blockType: 'newsletter-signup',
    Component: NewsletterSignupPreview,
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
