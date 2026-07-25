import type { getPayload } from 'payload'

export type PayloadClient = Awaited<ReturnType<typeof getPayload>>

export type CliOptions = {
  help: boolean
  write: boolean
  generateVariants: boolean
  limit: number
  maxDocs: number | null
}

export type Counters = {
  scanned: number
  mediaSetsCreated: number
  articleRefsUpdated: number
  variantsLinked: number
  variantsGenerated: number
  mediaSetStatusesUpdated: number
  skipped: number
  errors: number
}

export type MigrationContext = {
  payload: PayloadClient
  options: CliOptions
  counters: Counters
}

export type ArticleCollectionConfig = {
  collection: 'articles' | 'single-type-listicles' | 'listicle-itineraries'
  headerField: 'headerSection' | 'header'
}

export type CardCollectionConfig = {
  collection:
    | 'locations'
    | 'accommodations'
    | 'dining'
    | 'attractions'
    | 'tours'
    | 'nightlife'
    | 'key-locations'
  field: 'coverImage' | 'gallery' | 'img'
}
