import { API_BASE_URL } from '../client/config'
import { parseErrorResponse } from '../client/error-parser'
import {
  buildExternalFallbackFileName,
  parseFileNameFromContentDisposition,
} from './external-images.utils'
import type {
  FetchExternalImageSourceRequest,
  FetchExternalImageSourceResponse,
  ImportExternalImageRequest,
  ImportExternalImageResponse,
  PexelsOrientation,
  PexelsSearchResponse,
  UnsplashSearchResponse,
} from './external-images.types'

export async function searchPexelsImages(
  query: string,
  params?: {
    perPage?: number
    page?: number
    orientation?: PexelsOrientation
  },
): Promise<PexelsSearchResponse> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    throw new Error('Search query is required')
  }

  const queryParams = new URLSearchParams()
  queryParams.append('query', normalizedQuery)
  queryParams.append('per_page', String(params?.perPage ?? 9))
  queryParams.append('page', String(params?.page ?? 1))
  if (params?.orientation) {
    queryParams.append('orientation', params.orientation)
  }

  const response = await fetch(
    `${API_BASE_URL}/images/pexels/search?${queryParams.toString()}`,
  )

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'Pexels search failed', { detail: { message: 'Pexels search failed' } })
    throw new Error(message)
  }

  return response.json()
}

export async function searchUnsplashImages(
  query: string,
  params?: {
    perPage?: number
    page?: number
    orientation?: PexelsOrientation
  },
): Promise<UnsplashSearchResponse> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    throw new Error('Search query is required')
  }

  const queryParams = new URLSearchParams()
  queryParams.append('query', normalizedQuery)
  queryParams.append('per_page', String(params?.perPage ?? 18))
  queryParams.append('page', String(params?.page ?? 1))
  if (params?.orientation) {
    queryParams.append('orientation', params.orientation)
  }

  const response = await fetch(
    `${API_BASE_URL}/images/unsplash/search?${queryParams.toString()}`,
  )

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'Unsplash search failed', { detail: { message: 'Unsplash search failed' } })
    throw new Error(message)
  }

  return response.json()
}

export async function importExternalImage(
  input: ImportExternalImageRequest,
  token: string,
): Promise<ImportExternalImageResponse> {
  const normalizedSourceUrl = input.sourceUrl.trim()
  if (!normalizedSourceUrl) {
    throw new Error('sourceUrl is required')
  }

  const formData = new FormData()
  formData.append('source_url', normalizedSourceUrl)
  formData.append('provider', input.provider)
  formData.append('external_ref', input.externalRef)
  formData.append('alt_text', input.altText)
  formData.append('photographer_credit', input.photographerCredit)
  formData.append('location_ref', String(input.locationRef))
  if (input.photoId !== undefined && input.photoId !== null) {
    formData.append('photo_id', String(input.photoId))
  }

  const response = await fetch(`${API_BASE_URL}/images/import-external`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'External image import failed', { detail: { message: 'External image import failed' } })
    throw new Error(message)
  }

  return response.json()
}

export async function fetchExternalImageSource(
  input: FetchExternalImageSourceRequest,
  token: string,
): Promise<FetchExternalImageSourceResponse> {
  const normalizedSourceUrl = input.sourceUrl.trim()
  if (!normalizedSourceUrl) {
    throw new Error('sourceUrl is required')
  }

  const queryParams = new URLSearchParams()
  queryParams.append('source_url', normalizedSourceUrl)
  queryParams.append('provider', input.provider)
  if (input.photoId !== undefined && input.photoId !== null) {
    queryParams.append('photo_id', String(input.photoId))
  }

  const response = await fetch(
    `${API_BASE_URL}/images/external-source?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'Failed to fetch external image source', { detail: { message: 'Failed to fetch external image source' } })
    throw new Error(message)
  }

  const blob = await response.blob()
  const contentType = response.headers.get('content-type') || blob.type || 'image/jpeg'
  const fileName = parseFileNameFromContentDisposition(
    response.headers.get('content-disposition'),
  ) || buildExternalFallbackFileName(input.provider, input.photoId)

  return {
    blob,
    fileName,
    contentType,
  }
}
