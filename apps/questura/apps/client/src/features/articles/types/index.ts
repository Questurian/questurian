export type MediaAsset = {
  id: number
  url: string
  alt_text?: string
  mediaSet?: { alt_text?: string }
}

export type TextBlock = {
  id: string
  blockType: 'text'
  content: string
}

export type ImageBlock = {
  id: string
  blockType: 'image'
  image: MediaAsset
  altText?: string
  caption?: string
}

export type ImgPairBlock = {
  id: string
  blockType: 'img-pair'
  imageOne: MediaAsset
  imageTwo: MediaAsset
  caption?: string
}

export type ImgTrioBlock = {
  id: string
  blockType: 'img-trio'
  format: 'square' | 'landscape'
  imageOne: MediaAsset
  imageTwo: MediaAsset
  imageThree: MediaAsset
  caption?: string
}

export type KeyTakeawayBlock = {
  id: string
  blockType: 'key-takeaway'
  label?: string
  items: Array<{ id?: string; text: string }>
}

export type PullQuoteBlock = {
  id: string
  blockType: 'pull-quote'
  quote: string
}

export type InTheKnowBlock = {
  id: string
  blockType: 'in-the-know'
  label?: string
  text: string
}

export type HighlightCalloutBlock = {
  id: string
  blockType: 'highlight-callout'
  label?: string
  text: string
}

export type FaqItem = {
  id: string
  question: string
  answer: string
}

export type FaqBlock = {
  id: string
  blockType: 'faq'
  label?: string
  title?: string
  items: FaqItem[]
}

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | ImgPairBlock
  | ImgTrioBlock
  | KeyTakeawayBlock
  | PullQuoteBlock
  | InTheKnowBlock
  | HighlightCalloutBlock
  | FaqBlock

export type ArticleAuthor = {
  id: number
  firstName: string
  lastName: string
  publicProfile: {
    displayName: string
    avatar: string | null
  }
}

export type SeoSection = {
  metaDescription?: string
  seoTitle?: string
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
  structuredData?: unknown
  robots?: {
    index?: 'index' | 'noindex'
    follow?: 'follow' | 'nofollow'
  }
}

export type Article = {
  id: number
  title: string
  slug: string
  status: string
  publishedAt: string
  updatedAt: string
  author: ArticleAuthor
  tags: Array<{ id: number; name: string; slug: string }>
  location: string
  headerSection: {
    featuredImage: MediaAsset & { alt_text: string }
  }
  contentBlocks: ContentBlock[]
  seoSection?: SeoSection
}

export {
  isListicleVenue,
  isMapsListicleArticle,
  type ListicleItemRow,
  type MapsListicleArticle,
} from './mapsListicle'

export {
  isListicleItineraryArticle,
  type ItineraryDay,
  type ItineraryStopBlock,
  type ItineraryTourAgencyBlock,
  type ItineraryVenueBlock,
  type ListicleItineraryArticle,
} from './itineraryListicle'

export type MapsItem = {
  id: string
  blockType: 'data-dining' | 'data-accommodations' | 'data-attractions' | 'data-nightlife'
  blurb: string
  [key: string]: unknown
}

export type MapsArticle = Omit<Article, 'contentBlocks' | 'headerSection'> & {
  items: MapsItem[]
  header: {
    intro: string
    featuredImage?: MediaAsset
  }
}
