import type { SeoSection } from '../../shared/seo/types'
import type { PayloadSyncStateFields } from '../../shared/payloadSync/draftPayloadSync'

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

export type DraftUserStamp = {
  id: string
  email: string
  name?: string
}

export type StagedArticle = PayloadSyncStateFields & {
  id: string
  runId: string
  originalTitle: string
  originalContent: string
  originalType: string
  title: string
  /**
   * What this run is called in the drafts list.
   *
   * Six attempts at one subject produce roughly the same title, so the title
   * cannot tell them apart. This is built from what varies -- the form, the
   * models, the time -- and it is why keeping a failure on purpose is useful
   * rather than just tidy.
   */
  draftName?: string
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
  createdBy?: DraftUserStamp
  lastEditedBy?: DraftUserStamp
  createdAt: string
  updatedAt: string
}
