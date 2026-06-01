import type { CreateArticlePayload } from '../../../../api'

export type PayloadContentBlock = NonNullable<CreateArticlePayload['contentBlocks']>[number]
export type SupportedPayloadBlockType =
  | 'key-takeaway'
  | 'pull-quote'
  | 'in-the-know'
  | 'highlight-callout'
  | 'faq'

export type FAQItem = {
  question: string
  answer: string
}

export type EditorialPublishValidation =
  | {
      status: 'supported'
      payloadBlock: PayloadContentBlock
      correctedMarkdown: string
      mappedPayloadBlockType: SupportedPayloadBlockType
    }
  | {
      status: 'invalid'
      message: string
      correctedMarkdown: string
    }
  | {
      status: 'unsupported'
      message: string
    }

export type EditorialPublishAnalysis = {
  byId: Record<string, EditorialPublishValidation>
  blockingBlocks: Array<{ blockId: string; message: string }>
  hasBlockingBlocks: boolean
}
