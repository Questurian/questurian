import type { GlobalConfig } from 'payload'

import { ArticleGridBlock } from './blocks/article-grid'
import { FeaturedArticleBlock } from './blocks/featured-article'
import { FeaturedArticleCarouselBlock } from './blocks/featured-article-carousel'
import { FeaturedArticlesBlock } from './blocks/featured-articles'
import { HotelGridBlock } from './blocks/hotel-grid'
import { LocationGridBlock } from './blocks/location-grid'
import { QuesturianMapsBlock } from './blocks/questurian-maps'
import { WhereToEatDrinkBlock } from './blocks/where-to-eat-drink'
import { ThingsToDoAttractionsBlock } from './blocks/things-to-do-attractions'
import { ThingsToDoListiclesBlock } from './blocks/things-to-do-listicles'
import { NewsletterSignupBlock } from './blocks/newsletter-signup'
import { MAIN_LOCATION_GRID_SCOPE } from './location-grid-service'
import { normalizePageBlocksArrayInPlace } from './page-blocks-validation'
import { HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG } from './types'

const HOMEPAGE_BLOCK_TYPES = [
  FeaturedArticleBlock,
  FeaturedArticleCarouselBlock,
  FeaturedArticlesBlock,
  ArticleGridBlock,
  LocationGridBlock,
  QuesturianMapsBlock,
  HotelGridBlock,
  WhereToEatDrinkBlock,
  ThingsToDoListiclesBlock,
  ThingsToDoAttractionsBlock,
  NewsletterSignupBlock,
] as const

export const HomepageFeaturedContent: GlobalConfig = {
  slug: HOMEPAGE_FEATURED_CONTENT_GLOBAL_SLUG,
  label: 'Main Homepage',
  access: {
    read: () => true,
    update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
  },
  admin: {
    description:
      'Main domain homepage built from content blocks. Each block is a curated article module with its own layout.',
  },
  fields: [
    {
      name: 'pageBlocks',
      type: 'blocks',
      blocks: [...HOMEPAGE_BLOCK_TYPES],
      label: 'Page blocks',
      admin: {
        description: 'Curated sections for the main homepage (articles, grids, etc.).',
      },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req }) => {
        if (!data) return data

        const arr = data['pageBlocks' as keyof typeof data]
        if (Array.isArray(arr)) {
          await normalizePageBlocksArrayInPlace(req, arr as unknown[], MAIN_LOCATION_GRID_SCOPE)
        }

        return data
      },
    ],
  },
}
