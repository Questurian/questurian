import type {
  ArticleCollectionConfig,
  CardCollectionConfig,
  Counters,
} from './types'

export const ARTICLE_COLLECTIONS: ArticleCollectionConfig[] = [
  { collection: 'articles', headerField: 'headerSection' },
  { collection: 'single-type-listicles', headerField: 'header' },
  { collection: 'listicle-itineraries', headerField: 'header' },
]

export const CARD_COLLECTIONS: CardCollectionConfig[] = [
  { collection: 'locations', field: 'coverImage' },
  { collection: 'accommodations', field: 'gallery' },
  { collection: 'dining', field: 'gallery' },
  { collection: 'attractions', field: 'gallery' },
  { collection: 'tours', field: 'img' },
  { collection: 'nightlife', field: 'gallery' },
  { collection: 'key-locations', field: 'gallery' },
]

export const createCounters = (): Counters => ({
  scanned: 0,
  mediaSetsCreated: 0,
  articleRefsUpdated: 0,
  variantsLinked: 0,
  variantsGenerated: 0,
  mediaSetStatusesUpdated: 0,
  skipped: 0,
  errors: 0,
})
