import type { PayloadArticleDoc } from '../../../api/articles/articles.types'
import type { StagedArticle } from '../../../types'

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const toHumanName = (value: string | undefined): string | undefined => {
  const normalized = normalizeText(value)
  if (!normalized) return undefined

  return normalized
    .split(/\s+/)
    .map((part) => {
      if (!part) return part
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

const toAuthorName = (value: PayloadArticleDoc['author']): string | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  // Taken verbatim: an Author's `displayName` is authored text, not a machine
  // name to re-case. `toHumanName` still tidies the configured fallback.
  const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : ''

  return displayName || undefined
}

export function buildPayloadArticleMetadataPatch(input: {
  doc: PayloadArticleDoc
  fallbackAuthorName?: string
}): Partial<StagedArticle> {
  const { doc, fallbackAuthorName } = input
  const payloadStatus = doc.status === 'published' ? 'published' : 'draft'
  const payloadAuthorName = toAuthorName(doc.author) || toHumanName(fallbackAuthorName)

  return {
    payloadArticleId: doc.id,
    publishedToPayload: true,
    payloadStatus,
    payloadSlug: normalizeText(doc.slug),
    payloadPublishedAt: payloadStatus === 'published' ? normalizeText(doc.publishedAt) : undefined,
    payloadUpdatedAt: normalizeText(doc.updatedAt) || normalizeText(doc.createdAt),
    payloadAuthorName,
  }
}
