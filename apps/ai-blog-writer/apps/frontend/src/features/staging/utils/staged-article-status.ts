import type { StagedArticle } from '../types'

type StagedArticleStatusBadge = {
  className: 'published' | 'ready' | 'partial' | 'draft'
  label: string
}

type StagedArticleStatusOptions = {
  showEditorialBlocking?: boolean
}

export function getStagedArticleStatusBadge(
  article: StagedArticle,
  options: StagedArticleStatusOptions = {},
): StagedArticleStatusBadge {
  const showEditorialBlocking = Boolean(options.showEditorialBlocking)

  if (article.payloadStatus === 'published') {
    return { className: 'published', label: '✓ Published' }
  }

  if (article.payloadArticleId || article.publishedToPayload) {
    return { className: 'ready', label: 'Linked Draft' }
  }

  if (showEditorialBlocking && article.editorialBlocks?.length) {
    return { className: 'partial', label: 'Editorial Blocked' }
  }

  if (article.lexicalConverted && article.locationId && article.featuredImageId) {
    return { className: 'ready', label: 'Ready to Publish' }
  }

  if (article.lexicalConverted) {
    return { className: 'partial', label: 'Lexical Ready' }
  }

  return { className: 'draft', label: 'Draft' }
}

export function getStagedArticleMissingFields(
  article: StagedArticle,
  options: StagedArticleStatusOptions = {},
): string[] {
  const showEditorialBlocking = Boolean(options.showEditorialBlocking)
  const missing: string[] = []

  if (!article.locationId) missing.push('location')
  if (!article.featuredImageId) missing.push('featured image')
  if (showEditorialBlocking && article.editorialBlocks?.length) {
    missing.push('editorial block handling')
  }

  return missing
}
