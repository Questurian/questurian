import type {
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedCollection
} from '../../types'
import type { HomepageLocationGridCandidatesResponse } from '../../locationGridTypes'
import type { HomepageHotelGridCandidatesResponse } from '../../hotelGridTypes'
import { locationHomepageRequest } from '../request'
import {
  buildCandidateQuery,
  type CandidateQueryParams
} from './candidateQuery'

export async function fetchLocationHomepageCandidates(
  id: number,
  params: CandidateQueryParams & {
    type?: HomepageFeaturedCollection | 'all'
  } = {}
): Promise<HomepageFeaturedCandidatesResponse> {
  const queryParams = new URLSearchParams(buildCandidateQuery(params))

  if (params.type && params.type !== 'all') {
    queryParams.set('type', params.type)
  }

  const query = queryParams.toString()
  return locationHomepageRequest(
    `/api/location-homepages/${id}/candidates${query ? `?${query}` : ''}`,
  )
}

export async function fetchLocationHomepageLocationGridCandidates(
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageLocationGridCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/location-candidates${buildCandidateQuery(params)}`,
  )
}

export async function fetchLocationHomepageHotelGridCandidates(
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageHotelGridCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/hotel-candidates${buildCandidateQuery(params)}`,
  )
}

export async function fetchLocationHomepageTourGridCandidates(
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageHotelGridCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/tour-candidates${buildCandidateQuery(params)}`,
  )
}

export async function fetchLocationHomepageWhereToEatDrinkCandidates(
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageFeaturedCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/where-to-eat-drink-candidates${buildCandidateQuery(params)}`,
  )
}

export async function fetchLocationHomepageThingsToDoListicleCandidates(
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageFeaturedCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/things-to-do-listicle-candidates${buildCandidateQuery(params)}`,
  )
}

export async function fetchLocationHomepageThingsToDoAttractionCandidates(
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageHotelGridCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/things-to-do-attraction-candidates${buildCandidateQuery(params)}`,
  )
}
