import type {
  HomepageFeaturedInvalidReason,
  HomepageFeaturedItemRef,
} from './homepage-featured.types'

export type { PayloadFindWhere } from '../../payload.types'

export type PayloadDocLike = {
  id?: unknown
  title?: unknown
  slug?: unknown
  status?: unknown
  updatedAt?: unknown
  publishedAt?: unknown
  headerSection?: unknown
  header?: unknown
  author?: unknown
  category?: unknown
  seoSection?: unknown
  seo?: unknown
}

export type ParsedHomepageFeaturedSlot = {
  slot: number
  ref: HomepageFeaturedItemRef | null
  reason: HomepageFeaturedInvalidReason | null
}
