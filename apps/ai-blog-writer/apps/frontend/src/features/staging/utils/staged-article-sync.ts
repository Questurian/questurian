import type { StagedArticle } from '../types'

export function allowsResyncEditing(article: Pick<StagedArticle, 'syncBehavior'>): boolean {
  return article.syncBehavior === 'draft-sync'
}

export function isStagedArticleEditingLocked(
  article: Pick<StagedArticle, 'publishedToPayload' | 'payloadStatus' | 'syncBehavior'>,
): boolean {
  return article.payloadStatus === 'published' && !allowsResyncEditing(article)
}
