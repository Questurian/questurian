import type { EditorAssistModelName } from '../staging/api'

export type ListicleType = 'dining' | 'accommodations' | 'attractions' | 'nightlife'

export type ListicleBlockType =
  | 'data-dining'
  | 'data-accommodations'
  | 'data-attractions'
  | 'data-nightlife'

export type PayloadRichText = Record<string, unknown>

export type ListicleItemBlock = {
  id: string
  blockType: ListicleBlockType
  item: number | null
  blurbMarkdown: string
  blurbLexical?: PayloadRichText
  blurbJsonText?: string
}

export type SeoMetadataForm = {
  id?: number
  metaTitle: string
  metaDescription: string
  keywords: string
  ogTitle: string
  ogDescription: string
  ogImage: number | null
  canonicalUrl: string
  noIndex: boolean
  noFollow: boolean
  status: 'draft' | 'published'
}

export type SingleTypeListicleDraft = {
  draftId: string
  payloadId?: number
  editorModelName: EditorAssistModelName
  title: string
  location: string
  locationRef: number | null
  listicleType: ListicleType | ''
  targetItemCount: number
  step1_complete: boolean
  in_update_mode: boolean
  header: {
    customTitle: string
    introMarkdown: string
    introLexical?: PayloadRichText
    introJsonText?: string
    featuredImage: number | null
  }
  items: ListicleItemBlock[]
  seoSection: {
    seo: number | null
  }
  status: 'draft' | 'published'
  articleType: 'single-type-listicle'
  updatedAt: string
}

export type PayloadListicleDoc = {
  id: number
  title?: string
  location?: string
  locationRef?: number | { id?: number }
  listicleType?: ListicleType
  targetItemCount?: number
  step1_complete?: boolean
  in_update_mode?: boolean
  header?: {
    customTitle?: string
    intro?: PayloadRichText
    featuredImage?: number | { id?: number }
  }
  items?: Array<{
    id?: string
    blockType?: ListicleBlockType
    item?: number | { id?: number }
    blurb?: PayloadRichText
  }>
  seoSection?: {
    seo?: number | { id?: number }
  }
  status?: 'draft' | 'published'
  articleType?: 'single-type-listicle'
  updatedAt?: string
  createdAt?: string
}

export type PayloadListResponse<T> = {
  docs: T[]
  totalDocs: number
  totalPages?: number
}

export type LocationOption = {
  id: number
  locationKey: string
  country?: string
  city?: string | null
  neighborhood?: string | null
}

export type MediaAssetOption = {
  id: number
  filename: string
  alt?: string
  alt_text?: string
  altText?: string
  url?: string
  variant?: string
}

export type RelatedItemOption = {
  id: number
  title: string
  location?: string
  status?: string
}

export type SeoMetadataOption = {
  id: number
  metaTitle?: string
  metaDescription?: string
  status?: 'draft' | 'published'
}
