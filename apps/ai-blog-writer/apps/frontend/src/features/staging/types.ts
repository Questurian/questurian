export type ContentBlock = {
  id: string
  type: 'text' | 'pullquote'
  content: string
  imageAfter?: number
  imageAfterAltText?: string
}

export type EditorialBlock = {
  id: string
  component: string
  label: string
  markdown: string
  anchorLine?: number
  afterBlockId?: string | null
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
  editorialBlocks?: EditorialBlock[]
  locationId?: number
  featuredImageId?: number
  lexicalConverted: boolean
  lexicalData?: object
  publishedToPayload: boolean
  payloadArticleId?: number
  createdAt: string
  updatedAt: string
}
