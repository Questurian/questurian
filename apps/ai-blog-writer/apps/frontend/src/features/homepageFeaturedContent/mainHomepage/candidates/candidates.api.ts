import type {
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedCollection,
} from '../../types'
import type { HomepageLocationGridCandidatesResponse } from '../../locationGridTypes'
import type { HomepageHotelGridCandidatesResponse } from '../../hotelGridTypes'
import { mainHomepageRequest } from '../request'
import { buildCandidateQuery, type CandidateQueryParams } from './candidateQuery'

export async function fetchHomepageFeaturedCandidates(
  token: string,
  params: CandidateQueryParams & {
    type?: HomepageFeaturedCollection | 'all'
  } = {},
): Promise<HomepageFeaturedCandidatesResponse> {
  const queryParams = new URLSearchParams(buildCandidateQuery(params))

  if (params.type && params.type !== 'all') {
    queryParams.set('type', params.type)
  }

  const query = queryParams.toString()
  return mainHomepageRequest(
    `/api/homepage-featured-content/candidates${query ? `?${query}` : ''}`,
    token,
  )
}

export async function fetchHomepageLocationGridCandidates(
  token: string,
  params: CandidateQueryParams = {},
): Promise<HomepageLocationGridCandidatesResponse> {
  return mainHomepageRequest(
    `/api/homepage-featured-content/location-candidates${buildCandidateQuery(params)}`,
    token,
  )
}

export async function fetchHomepageHotelGridCandidates(
  token: string,
  params: CandidateQueryParams = {},
): Promise<HomepageHotelGridCandidatesResponse> {
  return mainHomepageRequest(
    `/api/homepage-featured-content/hotel-candidates${buildCandidateQuery(params)}`,
    token,
  )
}

export async function fetchWhereToEatDrinkCandidates(
  token: string,
  params: CandidateQueryParams = {},
): Promise<HomepageFeaturedCandidatesResponse> {
  return mainHomepageRequest(
    `/api/homepage-featured-content/where-to-eat-drink-candidates${buildCandidateQuery(params)}`,
    token,
  )
}

export async function fetchThingsToDoListicleCandidates(
  token: string,
  params: CandidateQueryParams = {},
): Promise<HomepageFeaturedCandidatesResponse> {
  return mainHomepageRequest(
    `/api/homepage-featured-content/things-to-do-listicle-candidates${buildCandidateQuery(params)}`,
    token,
  )
}

export async function fetchTourGridCandidates(
  token: string,
  params: CandidateQueryParams = {},
): Promise<HomepageHotelGridCandidatesResponse> {
  return mainHomepageRequest(
    `/api/homepage-featured-content/tour-candidates${buildCandidateQuery(params)}`,
    token,
  )
}

export async function fetchThingsToDoAttractionCandidates(
  token: string,
  params: CandidateQueryParams = {},
): Promise<HomepageHotelGridCandidatesResponse> {
  return mainHomepageRequest(
    `/api/homepage-featured-content/things-to-do-attraction-candidates${buildCandidateQuery(params)}`,
    token,
  )
}
