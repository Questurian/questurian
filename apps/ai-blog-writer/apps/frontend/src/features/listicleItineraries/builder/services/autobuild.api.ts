import { API_BASE_URL } from '../../../../shared/api/client/config'
import { parseErrorResponse } from '../../../../shared/api/client/error-parser'
import type { DayShellTemplate, ItineraryBlockType, ShellSlotDaypart } from '../../types'

/** One filled slot returned by Itinerary Autobuild (backend `PlanStop`). */
export type AutobuildPlanStop = {
  slot_id: string
  slot_label: string
  daypart: ShellSlotDaypart
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
  shell_id?: string | null
  shell_name?: string | null
  where_staying: AutobuildPlanLodging[]
  items: AutobuildPlanStop[]
}

export type AutobuildSlotIssue = {
  day_index: number
  shell_id: string
  slot_id: string
  slot_label: string
  daypart: ShellSlotDaypart
  issue: string
}

export type AutobuildResponse = {
  days: AutobuildPlanDay[]
  plan_overview: string
  model_used: string
  notes: string[]
  slot_issues: AutobuildSlotIssue[]
}

export type GenerateItineraryParams = {
  location: string
  title: string
  brief: string
  dayCount: number
  /** Operator JWT — the backend reads Payload with it (never writes). */
  payloadToken: string
  sharedNeighborhoods?: number[]
  dayShells: Array<{ dayIndex: number; shell: DayShellTemplate }>
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
      day_shells: params.dayShells.map(({ dayIndex, shell }) => ({
        day_index: dayIndex,
        shell_id: shell.id,
        shell_name: shell.name,
        shell_description: shell.description,
        slots: shell.slots.map((slot) => ({
          id: slot.id,
          label: slot.label,
          daypart: slot.daypart,
          acceptable_collections: slot.acceptableCollections,
          preferred_collections: slot.preferredCollections,
          intent_tags: slot.intentTags,
          avoid_tags: slot.avoidTags ?? [],
        })),
      })),
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
