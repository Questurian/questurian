export type RelationshipId = string | number

export type DetailFieldName =
  | 'diningType'
  | 'accommodationType'
  | 'nightlifeType'
  | 'attractionType'

export type DetailCollectionSlug =
  | 'dining-details'
  | 'accommodation-details'
  | 'nightlife-details'
  | 'attraction-details'

export type DetailTypeValues = Partial<Record<DetailFieldName, string>>

export type PlaceCategory = {
  id: RelationshipId
  slug: string
}

export type PlaceDetailConfig = {
  categorySlug: string
  label: string
  fieldName: DetailFieldName
  options: readonly {
    label: string
    value: string
  }[]
  detailCollection: DetailCollectionSlug
}

export type PlaceDetailApiResponse = {
  docs?: unknown[]
}
