import type { PayloadListicleDoc, SingleTypeListicleDraft } from '../../types'

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
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

const toAuthorName = (value: PayloadListicleDoc['author']): string | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const firstName = toHumanName(typeof value.firstName === 'string' ? value.firstName : undefined)
  const lastName = toHumanName(typeof value.lastName === 'string' ? value.lastName : undefined)
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  if (fullName) return fullName

  return firstName || lastName
}

export function buildPayloadListicleMetadataPatch(input: {
  doc: PayloadListicleDoc
  fallbackAuthorName?: string
}): Partial<SingleTypeListicleDraft> {
  const { doc, fallbackAuthorName } = input
  const payloadStatus = doc.status === 'published' ? 'published' : 'draft'
  const payloadAuthorName = toAuthorName(doc.author) || toHumanName(fallbackAuthorName)

  return {
    payloadId: doc.id,
    payloadStatus,
    payloadSlug: normalizeText(doc.slug),
    payloadPublishedAt: payloadStatus === 'published' ? normalizeText(doc.publishedAt) : undefined,
    payloadUpdatedAt: normalizeText(doc.updatedAt) || normalizeText(doc.createdAt),
    payloadAuthorName,
  }
}
