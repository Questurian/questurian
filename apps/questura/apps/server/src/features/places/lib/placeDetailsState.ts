import { PLACE_DETAIL_CONFIGS } from '../placeDetailsConfig'
import type {
  DetailCollectionSlug,
  DetailTypeValues,
  PlaceCategory,
  PlaceDetailApiResponse,
  PlaceDetailConfig,
  RelationshipId,
} from '../types/placeDetails'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const extractRelationshipIds = (value: unknown): RelationshipId[] => {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    const id = isRecord(entry) ? entry.id : entry
    return (typeof id === 'string' || typeof id === 'number') && Boolean(id) ? [id] : []
  })
}

export const parsePlaceCategories = (response: unknown): PlaceCategory[] => {
  if (!isRecord(response) || !Array.isArray(response.docs)) return []

  return response.docs.flatMap((doc) => {
    if (!isRecord(doc)) return []

    const { id, slug } = doc
    if ((typeof id !== 'string' && typeof id !== 'number') || typeof slug !== 'string') {
      return []
    }

    return [{ id, slug }]
  })
}

export const getActivePlaceDetailConfigs = (
  categories: readonly PlaceCategory[],
): readonly PlaceDetailConfig[] => {
  const selectedSlugs = new Set(categories.map(({ slug }) => slug))
  return PLACE_DETAIL_CONFIGS.filter(({ categorySlug }) => selectedSlugs.has(categorySlug))
}

export const mapDetailResponsesToValues = (
  responses: Partial<Record<DetailCollectionSlug, PlaceDetailApiResponse>>,
): DetailTypeValues =>
  PLACE_DETAIL_CONFIGS.reduce<DetailTypeValues>((values, config) => {
    const firstDocument = responses[config.detailCollection]?.docs?.[0]
    if (!isRecord(firstDocument) || typeof firstDocument.type !== 'string' || !firstDocument.type) {
      return values
    }

    values[config.fieldName] = firstDocument.type
    return values
  }, {})
