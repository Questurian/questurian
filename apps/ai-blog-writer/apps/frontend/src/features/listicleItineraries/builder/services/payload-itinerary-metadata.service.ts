import type { ListicleItineraryDraft, PayloadItineraryDoc } from '../../types'

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

const toAuthorName = (value: PayloadItineraryDoc['author']): string | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  // Taken verbatim: an Author's `displayName` is authored text, not a machine
  // name to re-case. `toHumanName` still tidies the configured fallback.
  const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : ''

  return displayName || undefined
}

export function buildPayloadItineraryMetadataPatch(input: {
  doc: PayloadItineraryDoc
  fallbackAuthorName?: string
}): Partial<ListicleItineraryDraft> {
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
