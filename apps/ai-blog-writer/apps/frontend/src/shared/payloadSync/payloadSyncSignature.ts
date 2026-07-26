export function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeNumberSet(values: unknown): number[] {
  return Array.isArray(values)
    ? [...new Set(values.filter((value): value is number => Number.isFinite(value)))].sort((a, b) => a - b)
    : []
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortKeysDeep(entry)]),
  )
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value))
}

export function buildDraftPayloadSyncSignature<TDraft>(
  draft: TDraft,
  buildComparableShape: (draft: TDraft) => unknown,
): string {
  return stableSerialize(buildComparableShape(draft))
}
