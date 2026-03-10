import { API_BASE_URL, PAYLOAD_API_URL } from '../staging/api/client/config'
import { parseErrorResponse } from '../staging/api/client/error-parser'
import type {
  CurrencyOption,
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
import { sanitizeLocationDraftShape } from './schema'

export type LocationIndexFilters = {
  level?: string
  countryName?: string
  cityName?: string
  neighborhoodName?: string
  locationKey?: string
}

const PAYLOAD_REQUEST_TIMEOUT_MS = 12000

function toAiDraftPayload(draft: LocationDocumentDraft): Record<string, unknown> {
  const sanitizedDraft = sanitizeLocationDraftShape(draft)
  const payloadDraft: Record<string, unknown> = { ...sanitizedDraft }
  delete payloadDraft.draftId
  delete payloadDraft.payloadId
  delete payloadDraft.currentPayloadSignature
  delete payloadDraft.lastPayloadSyncSignature
  delete payloadDraft.lastPayloadSyncAt
  delete payloadDraft.hasUnsyncedPayloadChanges
  delete payloadDraft.editorModelName
  delete payloadDraft.aiSourceNotes
  delete payloadDraft.updatedAt
  return payloadDraft
}

async function payloadRequest<T>(endpoint: string, token: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), PAYLOAD_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
      ...init,
      signal: controller.signal,
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
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Payload request timed out after ${Math.round(PAYLOAD_REQUEST_TIMEOUT_MS / 1000)}s`)
    }

    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function isPayloadLocationDoc(value: unknown): value is PayloadLocationDoc {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { id?: unknown }
  return typeof candidate.id === 'number' && Number.isFinite(candidate.id)
}

function parsePayloadLocationDocResponse(
  response: unknown,
  operation: string,
): PayloadLocationDoc {
  if (isPayloadLocationDoc(response)) {
    return response
  }

  if (response && typeof response === 'object') {
    const wrappedDoc = (response as { doc?: unknown }).doc
    if (isPayloadLocationDoc(wrappedDoc)) {
      return wrappedDoc
    }
  }

  const keys = response && typeof response === 'object'
    ? Object.keys(response as Record<string, unknown>).slice(0, 10)
    : []
  const details = keys.length > 0 ? `keys: ${keys.join(', ')}` : `type: ${typeof response}`
  throw new Error(`${operation} returned an unexpected response shape (${details}).`)
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
  const response = await payloadRequest<unknown>(`/api/locations/${id}?depth=0`, token)
  return parsePayloadLocationDocResponse(response, 'Fetch location')
}

export async function createLocation(body: PayloadLocationBody, token: string): Promise<PayloadLocationDoc> {
  const response = await payloadRequest<unknown>(`/api/locations`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return parsePayloadLocationDocResponse(response, 'Create location')
}

export async function updateLocation(id: number, body: PayloadLocationBody, token: string): Promise<PayloadLocationDoc> {
  const response = await payloadRequest<unknown>(`/api/locations/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return parsePayloadLocationDocResponse(response, 'Update location')
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

export async function fetchCurrencyOptions(token: string): Promise<CurrencyOption[]> {
  const docs: CurrencyOption[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const params = new URLSearchParams()
    params.set('depth', '0')
    params.set('limit', '200')
    params.set('page', String(page))
    params.set('sort', 'code')
    params.set('where[status][equals]', 'active')
    appendSelectParams(params, [
      'id',
      'code',
      'name',
      'symbol',
      'displaySymbol',
      'defaultLocale',
      'decimalPlaces',
      'latestUsdRate',
      'status',
    ])

    const response = await payloadRequest<PayloadListResponse<CurrencyOption>>(`/api/currencies?${params.toString()}`, token)
    docs.push(...(response.docs || []))
    totalPages = response.totalPages || 1
    page += 1
  }

  return docs
}

export async function fetchMediaSetLibrary(
  token: string,
  params: {
    limit?: number
    id?: number
  } = {},
): Promise<MediaSetOption[]> {
  const query = new URLSearchParams()
  query.set('depth', '2')
  query.set('limit', String(params.id ? 1 : (params.limit ?? 200)))
  query.set('sort', '-updatedAt')

  if (params.id) {
    query.set('where[id][equals]', String(params.id))
  }

  const response = await payloadRequest<PayloadListResponse<MediaSetOption>>(`/api/media-sets?${query.toString()}`, token)
  return response.docs || []
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
