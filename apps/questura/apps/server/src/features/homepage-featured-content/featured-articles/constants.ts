import type { HomepageFeaturedCollection } from './types/homepage-featured.types'

export const HOMEPAGE_FEATURED_COLLECTION_LABELS: Record<HomepageFeaturedCollection, string> = {
  articles: 'Standard Article',
  'single-type-listicles': 'Single Type Listicle',
  'listicle-itineraries': 'Listicle Itinerary',
}

export const FEATURED_ARTICLES_SLOT3_LAYOUT_VALUES = ['hero-left', 'featured-center'] as const
export type FeaturedArticlesSlot3Layout = (typeof FEATURED_ARTICLES_SLOT3_LAYOUT_VALUES)[number]

export const FEATURED_ARTICLES_SLOT4_LAYOUT_VALUES = ['sidebar-stack', 'one-over-three'] as const
export type FeaturedArticlesSlot4Layout = (typeof FEATURED_ARTICLES_SLOT4_LAYOUT_VALUES)[number]

export const FEATURED_ARTICLES_SLOT5_LAYOUT_VALUES = ['card-grid', 'hero-sidebar'] as const
export type FeaturedArticlesSlot5Layout = (typeof FEATURED_ARTICLES_SLOT5_LAYOUT_VALUES)[number]
