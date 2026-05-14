export type ApiCuratedBlock = {
  id: string
  blockType: string
  sectionHeading?: string | null
  sectionSubheading?: string | null
  slot3Layout?: unknown
  slot4Layout?: unknown
  slot5Layout?: unknown
  mediaAspect?: unknown
  articleGridFourLayout?: unknown
}

export type PublicPreviewPerson = {
  id: number | null
  name: string | null
  firstName: string | null
  lastName: string | null
}

export type PublicPreviewCategory = {
  id: number | null
  name: string | null
  slug: string | null
}

export type PublicArticleItem = {
  title: string
  articleType: string | null
  excerpt: string | null
  author: PublicPreviewPerson | null
  category: PublicPreviewCategory | null
  imageUrl: string | null
  imageUrlSquare: string | null
}
