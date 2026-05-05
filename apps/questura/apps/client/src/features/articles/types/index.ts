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

export type FaqItem = {
  id: string
  question: string
  answer: string
}

export type FaqBlock = {
  id: string
  blockType: 'faq'
  title?: string
  items: FaqItem[]
}

export type ContentBlock = TextBlock | ImageBlock | ImgPairBlock | FaqBlock

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
  isMapsListicleArticle,
  type ListicleItemRow,
  type MapsListicleArticle,
} from './mapsListicle'

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
