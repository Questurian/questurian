import type { StagedArticle } from '../types'

export function allowsResyncEditing(article: Pick<StagedArticle, 'syncBehavior'>): boolean {
  return article.syncBehavior === 'draft-sync'
}

export function isStagedArticleEditingLocked(
  article: Pick<StagedArticle, 'publishedToPayload' | 'syncBehavior'>,
): boolean {
  return article.publishedToPayload && !allowsResyncEditing(article)
}
