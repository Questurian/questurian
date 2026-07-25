import type { StagedArticle } from '../../../types'
import { createEmptySeoSection } from '../../../../../shared/seo/services/seo-section.service'

export const EMPTY_STAGED_ARTICLE: StagedArticle = {
  id: '',
  runId: '',
  originalTitle: '',
  originalContent: '',
  originalType: '',
  title: '',
  content: '',
  blocks: [],
  editorialBlocks: [],
  sharedNeighborhoods: [],
  seoSection: createEmptySeoSection(),
  syncBehavior: 'finalize',
  lexicalConverted: false,
  publishedToPayload: false,
  hasUnsyncedPayloadChanges: false,
  payloadStatus: undefined,
  payloadSlug: undefined,
  payloadPublishedAt: undefined,
  payloadUpdatedAt: undefined,
  payloadAuthorName: undefined,
  createdAt: '',
  updatedAt: '',
}
