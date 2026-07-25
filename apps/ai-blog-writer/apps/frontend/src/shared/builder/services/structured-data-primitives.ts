export const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

export const asArray = (value: unknown): unknown[] | null => (
  Array.isArray(value) ? value : null
)

export const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

export const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export const isValidAbsoluteHttpUrl = (value: string): boolean => {
  if (!value.trim()) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const normalizeAbsoluteUrl = (value: unknown): string | undefined => {
  const normalized = normalizeText(value)
  if (!normalized) return undefined
  return isValidAbsoluteHttpUrl(normalized) ? normalized : undefined
}

export const toSchemaDate = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

export const getNestedValue = (source: Record<string, unknown>, path: string[]): unknown => {
  let cursor: unknown = source
  for (const part of path) {
    if (!isRecord(cursor)) return undefined
    cursor = cursor[part]
  }
  return cursor
}

export const pickFirstText = (source: Record<string, unknown>, paths: string[][]): string | undefined => {
  for (const path of paths) {
    const value = getNestedValue(source, path)
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return undefined
}

export const pickStringArray = (source: Record<string, unknown>, paths: string[][]): string[] => {
  for (const path of paths) {
    const value = getNestedValue(source, path)
    const arrayValue = asArray(value)
    if (!arrayValue) continue
    const normalized = arrayValue
      .map((entry) => normalizeText(entry))
      .filter((entry): entry is string => Boolean(entry))
    if (normalized.length > 0) return normalized
  }
  return []
}

/** Drops undefined/null, empty arrays, and empty objects so emitted JSON-LD carries no blank keys. */
export const compactValue = (value: unknown): unknown => {
  if (value === undefined || value === null) return undefined

  if (Array.isArray(value)) {
    const compactedArray = value
      .map((entry) => compactValue(entry))
      .filter((entry) => entry !== undefined)
    return compactedArray
  }

  if (!isRecord(value)) return value

  const compactedRecord = Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, compactValue(entry)])
      .filter(([, entry]) => (
        entry !== undefined
        && !(Array.isArray(entry) && entry.length < 1)
        && !(isRecord(entry) && Object.keys(entry).length < 1)
      )),
  )

  return compactedRecord
}

export const getNodeType = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  const typeArray = asArray(value)
  if (!typeArray || typeArray.length < 1) return null
  const first = typeArray[0]
  return typeof first === 'string' ? first : null
}
