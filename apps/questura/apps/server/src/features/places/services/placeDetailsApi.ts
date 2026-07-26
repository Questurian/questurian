import { PLACE_DETAIL_CONFIGS } from '../placeDetailsConfig'
import { parsePlaceCategories } from '../lib/placeDetailsState'
import type {
  DetailCollectionSlug,
  PlaceCategory,
  PlaceDetailApiResponse,
  RelationshipId,
} from '../types/placeDetails'

type JsonResponse = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

export type PlaceDetailsFetcher = (url: string) => Promise<JsonResponse>

const readJson = async (fetcher: PlaceDetailsFetcher, url: string): Promise<unknown> => {
  const response = await fetcher(url)
  if (!response.ok) {
    throw new Error(`Place details request failed (${response.status})`)
  }
  return response.json()
}

export const fetchPlaceCategories = async (
  ids: readonly RelationshipId[],
  fetcher: PlaceDetailsFetcher = fetch,
): Promise<PlaceCategory[]> => {
  if (ids.length === 0) return []

  const data = await readJson(
    fetcher,
    `/api/place-categories?where[id][in]=${ids.join(',')}&depth=0`,
  )
  return parsePlaceCategories(data)
}

export const fetchPlaceDetailResponses = async (
  placeId: RelationshipId,
  fetcher: PlaceDetailsFetcher = fetch,
): Promise<Record<DetailCollectionSlug, PlaceDetailApiResponse>> => {
  const entries = await Promise.all(
    PLACE_DETAIL_CONFIGS.map(async ({ detailCollection }) => {
      const response = await readJson(
        fetcher,
        `/api/${detailCollection}?where[place][equals]=${placeId}&depth=0`,
      )
      const data =
        typeof response === 'object' && response !== null
          ? (response as PlaceDetailApiResponse)
          : {}
      return [detailCollection, data] as const
    }),
  )

  return Object.fromEntries(entries) as Record<DetailCollectionSlug, PlaceDetailApiResponse>
}
