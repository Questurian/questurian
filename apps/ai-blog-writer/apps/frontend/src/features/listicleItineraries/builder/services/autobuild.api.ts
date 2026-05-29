import { API_BASE_URL } from '../../../../shared/api/client/config'
import { parseErrorResponse } from '../../../../shared/api/client/error-parser'
import type { ItineraryBlockType } from '../../types'

/** One filled slot returned by Itinerary Autobuild (backend `PlanStop`). */
export type AutobuildPlanStop = {
  block_type: ItineraryBlockType
  collection: 'dining' | 'accommodations' | 'attractions' | 'nightlife'
  item: number
  title: string
  selection_reason: string
}

export type AutobuildPlanLodging = {
  block_type: 'itinerary-where-staying'
  collection: 'accommodations'
  item: number | null
  title: string | null
  selection_reason: string
}

export type AutobuildPlanDay = {
  where_staying: AutobuildPlanLodging[]
  items: AutobuildPlanStop[]
}

export type AutobuildResponse = {
  days: AutobuildPlanDay[]
  plan_overview: string
  model_used: string
  notes: string[]
}

export type GenerateItineraryParams = {
  location: string
  title: string
  brief: string
  dayCount: number
  /** Operator JWT — the backend reads Payload with it (never writes). */
  payloadToken: string
  sharedNeighborhoods?: number[]
  modelName?: string | null
}

/** Call the ABW backend's Itinerary Autobuild pipeline (slots only). */
export async function generateItinerary(params: GenerateItineraryParams): Promise<AutobuildResponse> {
  const response = await fetch(`${API_BASE_URL}/itineraries-pipeline/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: params.location,
      title: params.title,
      brief: params.brief,
      day_count: params.dayCount,
      payload_jwt: params.payloadToken,
      shared_neighborhoods: params.sharedNeighborhoods ?? [],
      model_name: params.modelName ?? undefined,
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'Itinerary generation failed', {
      detail: 'Itinerary generation failed',
    })
    throw new Error(message)
  }

  return response.json()
}
