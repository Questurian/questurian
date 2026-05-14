const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const normalizeRelationshipId = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }

  if (!isRecord(value)) {
    return null
  }

  const directId = value.id
  if (typeof directId === 'string' || typeof directId === 'number') {
    return directId
  }

  const relationshipValue = value.value
  if (typeof relationshipValue === 'string' || typeof relationshipValue === 'number') {
    return relationshipValue
  }

  if (isRecord(relationshipValue)) {
    const nestedId = relationshipValue.id
    if (typeof nestedId === 'string' || typeof nestedId === 'number') {
      return nestedId
    }
  }

  return null
}

export const normalizeRelationshipIds = (value: unknown): Array<string | number> => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => normalizeRelationshipId(entry))
    .filter((id): id is string | number => id !== null)
}

export const relationshipIdToKey = (id: string | number): string => String(id)
