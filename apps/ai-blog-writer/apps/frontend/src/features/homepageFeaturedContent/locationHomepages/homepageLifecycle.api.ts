import { locationHomepageRequest } from './request'
import type {
  LocationHomepageListItem,
  LocationHomepageResponse,
  ResetAllHomepageContentResponse
} from './types'

export async function fetchLocationHomepagesList(
): Promise<LocationHomepageListItem[]> {
  return locationHomepageRequest('/api/location-homepages')
}

export async function resetAllHomepageContent(
): Promise<ResetAllHomepageContentResponse> {
  return locationHomepageRequest(
    '/api/homepage-featured-content/reset',
    {
      method: 'POST'
    }
  )
}

export async function createLocationHomepage(
  locationId: number
): Promise<{ id: number }> {
  return locationHomepageRequest('/api/location-homepages', {
    method: 'POST',
    body: JSON.stringify({ locationId })
  })
}

export async function fetchLocationHomepage(
  id: number,
  signal?: AbortSignal
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(`/api/location-homepages/${id}`, {
    signal
  })
}

export async function deleteLocationHomepage(
  id: number
): Promise<void> {
  await locationHomepageRequest(`/api/location-homepages/${id}`, {
    method: 'DELETE'
  })
}

export async function toggleLocationHomepage(
  id: number
): Promise<{ id: number; isEnabled: boolean }> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/toggle`,
    {
      method: 'PATCH'
    }
  )
}

export async function publishLocationHomepage(
  id: number
): Promise<LocationHomepageResponse> {
  return locationHomepageRequest(
    `/api/location-homepages/${id}/publish`,
    {
      method: 'POST'
    }
  )
}
