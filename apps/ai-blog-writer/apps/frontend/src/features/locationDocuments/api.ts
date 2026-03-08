import { API_BASE_URL, PAYLOAD_API_URL } from '../staging/api/client/config'
import { parseErrorResponse } from '../staging/api/client/error-parser'
import type {
  LocationAiFillDocumentRequest,
  LocationAiFillDocumentResponse,
  LocationAiFillFieldRequest,
  LocationAiFillFieldResponse,
  LocationAiFillSectionRequest,
  LocationAiFillSectionResponse,
  LocationDocumentDraft,
  LocationIndexRow,
  LocationOption,
  MediaSetOption,
  PayloadListResponse,
  PayloadLocationBody,
  PayloadLocationDoc,
} from './types'

export type LocationIndexFilters = {
  level?: string
  countryName?: string
  cityName?: string
  neighborhoodName?: string
  locationKey?: string
}

function toAiDraftPayload(draft: LocationDocumentDraft): Record<string, unknown> {
  const payloadDraft: Record<string, unknown> = { ...draft }
  delete payloadDraft.draftId
  delete payloadDraft.payloadId
  delete payloadDraft.editorModelName
  delete payloadDraft.aiSourceNotes
  delete payloadDraft.updatedAt
  return payloadDraft
}

async function payloadRequest<T>(endpoint: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Payload request failed' }))
    throw new Error(err.message || err.errors?.[0]?.message || `Payload request failed: ${response.status}`)
  }

  return response.json()
}

function appendSelectParams(params: URLSearchParams, fields: string[]) {
  for (const field of fields) {
    params.set(`select[${field}]`, 'true')
  }
}

function appendIndexFilters(params: URLSearchParams, filters: LocationIndexFilters) {
  if (filters.level) {
    params.set('where[level][equals]', filters.level)
  }

  if (filters.countryName) {
    params.set('where[countryName][like]', filters.countryName)
  }

  if (filters.cityName) {
    params.set('where[cityName][like]', filters.cityName)
  }

  if (filters.neighborhoodName) {
    params.set('where[neighborhoodName][like]', filters.neighborhoodName)
  }

  if (filters.locationKey) {
    params.set('where[locationKey][like]', filters.locationKey)
  }
}

export async function fetchLocationsIndex(token: string, filters: LocationIndexFilters = {}): Promise<LocationIndexRow[]> {
  const docs: LocationIndexRow[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const params = new URLSearchParams()
    params.set('depth', '0')
    params.set('limit', '100')
    params.set('sort', '-updatedAt')
    params.set('page', String(page))
    appendSelectParams(params, [
      'id',
      'level',
      'country',
      'city',
      'neighborhood',
      'countryName',
      'cityName',
      'neighborhoodName',
      'locationKey',
      'parentKey',
      'updatedAt',
    ])
    appendIndexFilters(params, filters)

    const response = await payloadRequest<PayloadListResponse<LocationIndexRow>>(`/api/locations?${params.toString()}`, token)
    docs.push(...(response.docs || []))
    totalPages = response.totalPages || 1
    page += 1
  }

  return docs
}

export async function fetchLocationById(id: number, token: string): Promise<PayloadLocationDoc> {
  const response = await payloadRequest<{ doc: PayloadLocationDoc }>(`/api/locations/${id}?depth=0`, token)
  return response.doc
}

export async function createLocation(body: PayloadLocationBody, token: string): Promise<PayloadLocationDoc> {
  const response = await payloadRequest<{ doc: PayloadLocationDoc }>(`/api/locations`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return response.doc
}

export async function updateLocation(id: number, body: PayloadLocationBody, token: string): Promise<PayloadLocationDoc> {
  const response = await payloadRequest<{ doc: PayloadLocationDoc }>(`/api/locations/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return response.doc
}

export async function fetchLocationOptions(token: string): Promise<LocationOption[]> {
  const docs: LocationOption[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const params = new URLSearchParams()
    params.set('depth', '0')
    params.set('limit', '200')
    params.set('page', String(page))
    params.set('sort', 'locationKey')
    appendSelectParams(params, [
      'id',
      'level',
      'country',
      'city',
      'neighborhood',
      'countryName',
      'cityName',
      'neighborhoodName',
      'locationKey',
    ])

    const response = await payloadRequest<PayloadListResponse<LocationOption>>(`/api/locations?${params.toString()}`, token)
    docs.push(...(response.docs || []))
    totalPages = response.totalPages || 1
    page += 1
  }

  return docs
}

export async function fetchMediaSetOptions(token: string): Promise<MediaSetOption[]> {
  const docs: MediaSetOption[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const params = new URLSearchParams()
    params.set('depth', '0')
    params.set('limit', '200')
    params.set('page', String(page))
    params.set('sort', 'title')
    appendSelectParams(params, ['id', 'title', 'alt_text', 'location'])

    const response = await payloadRequest<PayloadListResponse<MediaSetOption>>(`/api/media-sets?${params.toString()}`, token)
    docs.push(...(response.docs || []))
    totalPages = response.totalPages || 1
    page += 1
  }

  return docs
}

async function aiRequest<TResponse>(endpoint: string, body: Record<string, unknown>, fallback: string): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, fallback)
    throw new Error(message)
  }

  return response.json()
}

export async function fillLocationDocumentWithAi(
  input: LocationAiFillDocumentRequest,
): Promise<LocationAiFillDocumentResponse> {
  const response = await aiRequest<{
    document: LocationAiFillDocumentResponse['document']
    modelUsed: string
  }>(
    '/location-documents/ai/fill-document',
    {
      draft: toAiDraftPayload(input.draft),
      instruction: input.instruction,
      sourceNotes: input.sourceNotes,
      modelName: input.modelName,
    },
    'Location document AI generation failed',
  )

  return {
    document: response.document,
    modelUsed: response.modelUsed,
  }
}

export async function fillLocationSectionWithAi(
  input: LocationAiFillSectionRequest,
): Promise<LocationAiFillSectionResponse> {
  const response = await aiRequest<{
    sectionPath: string
    section: Record<string, unknown>
    modelUsed: string
  }>(
    '/location-documents/ai/fill-section',
    {
      draft: toAiDraftPayload(input.draft),
      sectionPath: input.sectionPath,
      currentSection: input.sectionValue,
      instruction: input.instruction,
      sourceNotes: input.sourceNotes,
      modelName: input.modelName,
    },
    'Location section AI generation failed',
  )

  return {
    sectionPath: response.sectionPath,
    section: response.section,
    modelUsed: response.modelUsed,
  }
}

export async function fillLocationFieldWithAi(
  input: LocationAiFillFieldRequest,
): Promise<LocationAiFillFieldResponse> {
  const response = await aiRequest<{
    fieldPath: string
    value: string
    modelUsed: string
  }>(
    '/location-documents/ai/fill-field',
    {
      draft: toAiDraftPayload(input.draft),
      fieldPath: input.fieldPath,
      currentValue: input.currentValue,
      instruction: input.instruction,
      sourceNotes: input.sourceNotes,
      modelName: input.modelName,
    },
    'Location field AI generation failed',
  )

  return {
    fieldPath: response.fieldPath,
    value: response.value,
    modelUsed: response.modelUsed,
  }
}
