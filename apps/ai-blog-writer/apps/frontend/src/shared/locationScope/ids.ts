export const getRelationshipId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

export const normalizeLocationIds = (values: unknown): number[] => {
  if (!Array.isArray(values)) return []

  const seen = new Set<number>()
  const ids: number[] = []

  for (const value of values) {
    const id = getRelationshipId(value)
    if (id === null || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  return ids
}

export const areLocationIdSelectionsEqual = (left: number[], right: number[]): boolean => {
  const normalizedLeft = [...normalizeLocationIds(left)].sort((a, b) => a - b)
  const normalizedRight = [...normalizeLocationIds(right)].sort((a, b) => a - b)

  if (normalizedLeft.length !== normalizedRight.length) return false

  for (let index = 0; index < normalizedLeft.length; index += 1) {
    if (normalizedLeft[index] !== normalizedRight[index]) return false
  }

  return true
}
