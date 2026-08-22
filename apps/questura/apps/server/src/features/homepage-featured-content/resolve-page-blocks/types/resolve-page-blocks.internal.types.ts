export type ApiCuratedBlock = {
  id: string
  blockType: string
  sectionHeading?: string | null
  sectionSubheading?: string | null
  creatorKicker?: string | null
  slot3Layout?: unknown
  slot4Layout?: unknown
  slot5Layout?: unknown
  mediaAspect?: unknown
  articleGridFourLayout?: unknown
  featureKicker?: unknown
  featureTitle?: unknown
  featureDescription?: unknown
  featureMediaSet?: unknown
  linkedLocation?: unknown
}

export type PublicPreviewPersonAvatar = {
  url: string
  alt: string | null
}

export type PublicPreviewPerson = {
  id: number | null
  slug: string | null
  /** The author's display name. Name parts left with the staff account (ADR-0007). */
  name: string | null
  /** Profile photo when present on the author record. */
  avatar?: PublicPreviewPersonAvatar | null
}

export type PublicPreviewCategory = {
  id: number | null
  name: string | null
  slug: string | null
}

export type PublicImage = {
  url: string | null
  alt: string
  width: number | null
  height: number | null
  variant: string | null
  status: string
}

export type PublicArticleItem = {
  title: string
  articleType: string | null
  excerpt: string | null
  author: PublicPreviewPerson | null
  category: PublicPreviewCategory | null
  imageUrl: string | null
  imageUrlSquare: string | null
  image: PublicImage | null
  imageSquare: PublicImage | null
  imageWide?: PublicImage | null
  imageHero?: PublicImage | null
  articlePath?: string | null
}
