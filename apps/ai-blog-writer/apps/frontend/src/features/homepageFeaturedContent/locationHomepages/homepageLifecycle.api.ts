import { locationHomepageRequest } from './request'
import type {
  LocationHomepageListItem,
  LocationHomepageResponse,
  ResetAllHomepageContentResponse
} from './types'

export async function fetchLocationHomepagesList(
  token: string
): Promise<LocationHomepageListItem[]> {
  return locationHomepageRequest('/api/location-homepages', token)
}

export async function resetAllHomepageContent(
  token: string
): Promise<ResetAllHomepageContentResponse> {
  return locationHomepageRequest(
    '/api/homepage-featured-content/reset',
    token,
    {
      method: 'POST'
    }
  )
}

export async function createLocationHomepage(
  token: string,
  locationId: number
): Promise<{ id: number }> {
  return locationHomepageRequest('/api/location-homepages', token, {
    method: 'POST',
    body: JSON.stringify({ locationId })
  })
}

export async function fetchLocationHomepage(
  token: string,
  id: number,
  signal?: AbortSignal
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}`, token, {
    signal
  })
}

export async function deleteLocationHomepage(
  token: string,
  id: number
): Promise<void> {
  await locationHomepageRequest(`/api/location-homepages/${id}`, token, {
    method: 'DELETE'
  })
}

export async function toggleLocationHomepage(
  token: string,
  id: number
): Promise<{ id: number; isEnabled: boolean }> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/toggle`,
    token,
    {
      method: 'PATCH'
    }
  )
}

export async function publishLocationHomepage(
  token: string,
  id: number
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/publish`,
    token,
    {
      method: 'POST'
    }
  )
}
