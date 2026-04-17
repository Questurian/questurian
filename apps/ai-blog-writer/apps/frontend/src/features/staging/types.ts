import type { SeoSection } from '../shared/seo/types'

export type ContentBlock = {
  id: string
  type: 'text' | 'pullquote' | 'image' | 'img-pair' | 'img-trio'
  content: string
  imageAfter?: number
  imageAfterAltText?: string
  imgPairAfter?: {
    imageOne: number
    imageTwo: number
    caption?: string
  }
  imgTrioAfter?: {
    format: 'square' | 'landscape'
    imageOne: number
    imageTwo: number
    imageThree: number
    caption?: string
  }
}

export type EditorialBlock = {
  id: string
  component: string
  label: string
  markdown: string
  anchorLine?: number
  afterBlockId?: string | null
  placeAfterImage?: boolean
}

export type StagedArticle = {
  id: string
  runId: string
  originalTitle: string
  originalContent: string
  originalType: string
  title: string
  content: string
  blocks: ContentBlock[]
  editorialBlocks: EditorialBlock[]
  locationId?: number
  sharedNeighborhoods: number[]
  editorModelName?: string
  featuredImageId?: number
  step1_complete?: boolean
  in_update_mode?: boolean
  step2_complete?: boolean
  step2_in_update_mode?: boolean
  step3_complete?: boolean
  step3_in_update_mode?: boolean
  seoSection?: SeoSection
  syncBehavior?: 'finalize' | 'draft-sync'
  lexicalConverted: boolean
  lexicalData?: object
  publishedToPayload: boolean
  payloadArticleId?: number
  payloadStatus?: 'draft' | 'published'
  payloadSlug?: string
  payloadPublishedAt?: string
  payloadUpdatedAt?: string
  payloadAuthorName?: string
  createdAt: string
  updatedAt: string
}
