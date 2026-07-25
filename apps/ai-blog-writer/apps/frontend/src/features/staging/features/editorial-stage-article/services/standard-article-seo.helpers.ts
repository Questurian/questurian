export const STRUCTURED_DATA_DESCRIPTION_MAX_LENGTH = 220

/**
 * NOTE: an empty value is treated as valid here — a blank Open Graph / Twitter
 * URL is an unset field, not an invalid one. This differs from
 * `isValidAbsoluteHttpUrl` in shared/builder, which rejects empty. Do not
 * consolidate the two without checking the SEO validation expectations.
 */
export const isValidAbsoluteUrl = (value: string): boolean => {
  if (!value.trim()) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const stripMarkdown = (value: string): string => (
  value
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
    .replace(/[*_~>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
)

export const stripPromotionalLeadIn = (value: string): string => {
  const leadInPatterns = [
    /^discover\s+/i,
    /^explore\s+/i,
    /^experience\s+/i,
    /^enjoy\s+/i,
    /^visit\s+/i,
  ]

  for (const pattern of leadInPatterns) {
    if (pattern.test(value)) {
      return value.replace(pattern, '').trim()
    }
  }

  return value
}

export const withReadableMaxLength = (
  value: string | undefined,
  maxLength: number,
): string | undefined => {
  if (!value) return value
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed

  const sentenceCandidates = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  const sentenceFit = sentenceCandidates.find((candidate) => candidate.length <= maxLength)
  if (sentenceFit && sentenceFit.length >= Math.floor(maxLength * 0.6)) {
    return sentenceFit
  }

  const clipped = trimmed.slice(0, maxLength)
  const lastSpace = clipped.lastIndexOf(' ')
  const base = (lastSpace >= Math.floor(maxLength * 0.5) ? clipped.slice(0, lastSpace) : clipped).trim()
  return base.replace(/[,:;.\-–—\s]+$/g, '')
}

export const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

export const normalizeAbsoluteUrl = (value: string): string | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return isValidAbsoluteUrl(trimmed) ? trimmed : undefined
}

export const toStructuredDataDescription = (value: string): string | undefined => {
  const normalized = stripPromotionalLeadIn(stripMarkdown(value))
  if (!normalized) return undefined
  return withReadableMaxLength(normalized, STRUCTURED_DATA_DESCRIPTION_MAX_LENGTH)
}

export const toSchemaDate = (value: string | undefined): string | undefined => {
  const normalized = normalizeText(value)
  if (!normalized) return undefined

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return undefined

  return parsed.toISOString()
}

export const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

export const asArray = (value: unknown): unknown[] | null => (
  Array.isArray(value) ? value : null
)

/**
 * Drops blanks recursively, and unlike the shared builder's `compactValue`
 * collapses now-empty arrays/objects to `undefined` rather than keeping them.
 */
export const compactValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return undefined

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? normalized : undefined
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => compactValue(entry))
      .filter((entry) => entry !== undefined)
    return normalized.length > 0 ? normalized : undefined
  }

  if (typeof value === 'object') {
    const normalizedEntries = Object.entries(value)
      .map(([entryKey, entryValue]) => [entryKey, compactValue(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined)

    return normalizedEntries.length > 0
      ? Object.fromEntries(normalizedEntries)
      : undefined
  }

  return value
}

export const getNodeType = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  const valueArray = asArray(value)
  if (!valueArray || valueArray.length < 1) return null
  const first = valueArray[0]
  return typeof first === 'string' ? first : null
}

export const getReferenceId = (value: unknown): string | undefined => {
  const record = asRecord(value)
  if (!record) return undefined
  return normalizeText(record['@id'])
}
