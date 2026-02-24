export type CreateArticlePayload = {
  title: string
  location?: string
  locationRef?: number
  step1_complete: boolean
  status?: 'draft' | 'published'
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
  >
  seoSection?: {
    seo?: number
  }
}
