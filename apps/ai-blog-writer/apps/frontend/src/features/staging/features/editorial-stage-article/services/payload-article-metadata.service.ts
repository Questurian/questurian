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

  const firstName = toHumanName(typeof value.firstName === 'string' ? value.firstName : undefined)
  const lastName = toHumanName(typeof value.lastName === 'string' ? value.lastName : undefined)
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  if (fullName) return fullName

  return firstName || lastName
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
