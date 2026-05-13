import type { StagedArticle } from '../../staging/types'
import type { Url2BlogSavedArticle } from '../api'

export type PayloadPublicationStatus = 'draft' | 'published'
export type ArticleLifecycleStatus = 'generated' | 'draft' | 'published'

export function resolveGeneratedArticleStatus(input: {
  article: Url2BlogSavedArticle
  payloadStatusByArticleId: Record<number, PayloadPublicationStatus | undefined>
}): ArticleLifecycleStatus {
  const { article, payloadStatusByArticleId } = input
  const isSynced = Boolean(article.synced_to_payload && article.payload_article_id)

  if (!isSynced) {
    return 'generated'
  }

  const payloadArticleId = article.payload_article_id
  if (!payloadArticleId) {
    return 'generated'
  }

  const payloadStatus = payloadStatusByArticleId[payloadArticleId]
  if (payloadStatus === 'published') return 'published'
  return 'draft'
}

export function findLocalDraftForGeneratedArticle(
  stagedArticles: StagedArticle[],
  article: Url2BlogSavedArticle,
): StagedArticle | undefined {
  if (article.payload_article_id) {
    const byPayloadId = stagedArticles.find((candidate) => (
      candidate.payloadArticleId === article.payload_article_id
    ))
    if (byPayloadId) return byPayloadId
  }

  return stagedArticles.find((candidate) => candidate.runId === article.run_id)
}

export function statusMeta(status: ArticleLifecycleStatus): {
  className: string
  label: string
} {
  if (status === 'published') {
    return { className: 'published', label: 'Published' }
  }
  if (status === 'draft') {
    return { className: 'draft', label: 'Draft' }
  }
  return { className: 'generated', label: 'Generated' }
}
