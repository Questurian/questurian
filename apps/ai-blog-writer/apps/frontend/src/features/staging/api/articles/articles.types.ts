export type PayloadArticleAuthor = {
  id?: number
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}

export type PayloadArticleDoc = {
  id: number
  title?: string
  slug?: string | null
  status?: 'draft' | 'published' | null
  author?: number | PayloadArticleAuthor | null
  publishedAt?: string | null
  updatedAt?: string
  createdAt?: string
  sourceFeature?: string | null
  sourceRunId?: string | null
}

export type CreateArticlePayload = {
  title: string
  slug?: string
  location?: string
  locationRef?: number
  sharedNeighborhoods?: number[]
  step1_complete: boolean
  status?: 'draft' | 'published'
  sourceFeature?: string
  sourceRunId?: string
  category?: number
  tags?: number[]
  headerSection?: {
    featuredImage?: number
    intro?: object
  }
  contentBlocks?: Array<
    | {
        blockType: 'text'
        content?: object
      }
    | {
        blockType: 'image'
        image?: number
        altText?: string
        caption?: string
      }
    | {
        blockType: 'img-pair'
        imageOne: number
        imageTwo: number
        caption?: string
      }
    | {
        blockType: 'img-trio'
        format: 'square' | 'landscape'
        imageOne: number
        imageTwo: number
        imageThree: number
        caption?: string
      }
    | {
        blockType: 'key-takeaway'
        label: string
        items: Array<{ text: string }>
      }
    | {
        blockType: 'pull-quote'
        quote: string
      }
    | {
        blockType: 'in-the-know'
        label: string
        text: string
      }
    | {
        blockType: 'highlight-callout'
        label: string
        text: string
      }
    | {
        blockType: 'faq'
        label: string
        items: Array<{
          question: string
          answer: string
        }>
      }
  >
  seoSection?: {
    seoTitle?: string
    metaDescription?: string
    openGraph?: {
      title?: string
      description?: string
      imageUrl?: string
      url?: string
    }
    twitterCard?: {
      card?: 'summary' | 'summary_large_image'
      title?: string
      description?: string
      imageUrl?: string
    }
    structuredData?: object
    robots?: {
      index?: 'index' | 'noindex'
      follow?: 'follow' | 'nofollow'
    }
  }
}
