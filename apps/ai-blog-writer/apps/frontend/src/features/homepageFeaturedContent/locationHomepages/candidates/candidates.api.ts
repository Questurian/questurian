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
  token: string,
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
    token
  )
}

export async function fetchLocationHomepageLocationGridCandidates(
  token: string,
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageLocationGridCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/location-candidates${buildCandidateQuery(params)}`,
    token
  )
}

export async function fetchLocationHomepageHotelGridCandidates(
  token: string,
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageHotelGridCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/hotel-candidates${buildCandidateQuery(params)}`,
    token
  )
}

export async function fetchLocationHomepageTourGridCandidates(
  token: string,
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageHotelGridCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/tour-candidates${buildCandidateQuery(params)}`,
    token
  )
}

export async function fetchLocationHomepageWhereToEatDrinkCandidates(
  token: string,
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageFeaturedCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/where-to-eat-drink-candidates${buildCandidateQuery(params)}`,
    token
  )
}

export async function fetchLocationHomepageThingsToDoListicleCandidates(
  token: string,
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageFeaturedCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/things-to-do-listicle-candidates${buildCandidateQuery(params)}`,
    token
  )
}

export async function fetchLocationHomepageThingsToDoAttractionCandidates(
  token: string,
  id: number,
  params: CandidateQueryParams = {}
): Promise<HomepageHotelGridCandidatesResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/things-to-do-attraction-candidates${buildCandidateQuery(params)}`,
    token
  )
}
