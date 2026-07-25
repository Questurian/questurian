import type { CollectionBeforeChangeHook } from 'payload'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const extractRelationshipId = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (!isRecord(value)) return null

  const id = value.id
  if (typeof id === 'string' || typeof id === 'number') return id

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

const relationshipIdsEqual = (
  left: string | number | null,
  right: string | number | null,
): boolean => left === right || (left !== null && right !== null && String(left) === String(right))

const textOrEmpty = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const mergeGroup = (
  original: unknown,
  next: unknown,
): Record<string, unknown> => ({
  ...(isRecord(original) ? original : {}),
  ...(isRecord(next) ? next : {}),
})

const clearMatchingImageValue = (
  value: unknown,
  staleUrls: Set<string>,
): { value: unknown; changed: boolean; removed: boolean } => {
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized && staleUrls.has(normalized)) {
      return { value: undefined, changed: true, removed: true }
    }
    return { value, changed: false, removed: false }
  }

  if (Array.isArray(value)) {
    let changed = false
    const nextItems: unknown[] = []

    for (const item of value) {
      const cleared = clearMatchingImageValue(item, staleUrls)
      changed = changed || cleared.changed
      if (!cleared.removed) {
        nextItems.push(cleared.value)
      }
    }

    return {
      value: nextItems,
      changed,
      removed: nextItems.length === 0,
    }
  }

  if (isRecord(value)) {
    const url = textOrEmpty(value.url)
    const contentUrl = textOrEmpty(value.contentUrl)
    if ((url && staleUrls.has(url)) || (contentUrl && staleUrls.has(contentUrl))) {
      return { value: undefined, changed: true, removed: true }
    }
  }

  return { value, changed: false, removed: false }
}

const clearMatchingStructuredDataImages = (
  value: unknown,
  staleUrls: Set<string>,
): { value: unknown; changed: boolean } => {
  if (Array.isArray(value)) {
    let changed = false
    const nextItems = value.map((item) => {
      const result = clearMatchingStructuredDataImages(item, staleUrls)
      changed = changed || result.changed
      return result.value
    })
    return { value: nextItems, changed }
  }

  if (!isRecord(value)) {
    return { value, changed: false }
  }

  let changed = false
  const nextValue: Record<string, unknown> = {}

  for (const [key, childValue] of Object.entries(value)) {
    if (key === 'image') {
      const cleared = clearMatchingImageValue(childValue, staleUrls)
      changed = changed || cleared.changed
      if (!cleared.removed) {
        nextValue[key] = cleared.value
      }
      continue
    }

    const result = clearMatchingStructuredDataImages(childValue, staleUrls)
    changed = changed || result.changed
    nextValue[key] = result.value
  }

  return { value: nextValue, changed }
}

export const clearStaleSocialImagesOnFeaturedImageChange: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
}) => {
  if (!data || operation !== 'update') return data

  const nextHeader = isRecord(data.header) ? data.header : null
  if (!nextHeader || !Object.prototype.hasOwnProperty.call(nextHeader, 'featuredImage')) {
    return data
  }

  const previousHeader = isRecord(originalDoc?.header) ? originalDoc.header : null
  const previousFeaturedImageId = extractRelationshipId(previousHeader?.featuredImage)
  const nextFeaturedImageId = extractRelationshipId(nextHeader.featuredImage)

  if (relationshipIdsEqual(previousFeaturedImageId, nextFeaturedImageId)) {
    return data
  }

  const originalSeo = isRecord(originalDoc?.seoSection) ? originalDoc.seoSection : {}
  const inputSeo = isRecord(data.seoSection) ? data.seoSection : {}
  const originalOpenGraph = isRecord(originalSeo.openGraph) ? originalSeo.openGraph : {}
  const inputOpenGraph = isRecord(inputSeo.openGraph) ? inputSeo.openGraph : {}
  const originalTwitterCard = isRecord(originalSeo.twitterCard) ? originalSeo.twitterCard : {}
  const inputTwitterCard = isRecord(inputSeo.twitterCard) ? inputSeo.twitterCard : {}

  const nextSeo = mergeGroup(originalSeo, inputSeo)
  const nextOpenGraph = mergeGroup(originalOpenGraph, inputOpenGraph)
  const nextTwitterCard = mergeGroup(originalTwitterCard, inputTwitterCard)
  const staleUrls = new Set<string>()

  const originalOpenGraphImageUrl = textOrEmpty(originalOpenGraph.imageUrl)
  const nextOpenGraphImageUrl = textOrEmpty(nextOpenGraph.imageUrl)
  if (originalOpenGraphImageUrl && nextOpenGraphImageUrl === originalOpenGraphImageUrl) {
    nextOpenGraph.imageUrl = null
    staleUrls.add(originalOpenGraphImageUrl)
  }

  const originalTwitterImageUrl = textOrEmpty(originalTwitterCard.imageUrl)
  const nextTwitterImageUrl = textOrEmpty(nextTwitterCard.imageUrl)
  if (originalTwitterImageUrl && nextTwitterImageUrl === originalTwitterImageUrl) {
    nextTwitterCard.imageUrl = null
    staleUrls.add(originalTwitterImageUrl)
  }

  nextSeo.openGraph = nextOpenGraph
  nextSeo.twitterCard = nextTwitterCard

  const structuredData = Object.prototype.hasOwnProperty.call(inputSeo, 'structuredData')
    ? inputSeo.structuredData
    : originalSeo.structuredData

  if (staleUrls.size > 0 && structuredData !== undefined && structuredData !== null) {
    const clearedStructuredData = clearMatchingStructuredDataImages(structuredData, staleUrls)
    if (clearedStructuredData.changed) {
      nextSeo.structuredData = clearedStructuredData.value
    }
  }

  data.seoSection = nextSeo

  return data
}
