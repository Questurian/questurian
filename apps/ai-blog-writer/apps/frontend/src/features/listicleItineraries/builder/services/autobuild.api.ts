import { apiFetch } from '../../../../shared/api/client/apiFetch'
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

export type AutobuildStepName = 'intent' | 'retrieve' | 'lodging' | 'slot' | 'reasons'
export type AutobuildStepStatus = 'ok' | 'warning' | 'failed'

/** One Autobuild Report entry: a pipeline decision with evidence + raw LLM I/O. */
export type AutobuildStepEvent = {
  name: AutobuildStepName
  label: string
  status: AutobuildStepStatus
  duration_ms: number
  day_index?: number | null
  slot_id?: string | null
  model?: string | null
  prompt?: string | null
  output?: string | null
  details: Record<string, unknown>
}

export type AutobuildResponse = {
  days: AutobuildPlanDay[]
  plan_overview: string
  model_used: string
  notes: string[]
  slot_issues: AutobuildSlotIssue[]
  steps: AutobuildStepEvent[]
}

export type GenerateItineraryParams = {
  location: string
  title: string
  brief: string
  dayCount: number
  sharedNeighborhoods?: number[]
  dayShells: Array<{ dayIndex: number; shell: DayShellTemplate }>
  modelName?: string | null
  /** Whole-trip Lodging Anchor on day 1; operator decision, default on. */
  includeLodging?: boolean
}

/** Call the ABW backend's Itinerary Autobuild pipeline (slots only). */
export async function generateItinerary(params: GenerateItineraryParams): Promise<AutobuildResponse> {
  const response = await apiFetch('/itineraries-pipeline/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: params.location,
      title: params.title,
      brief: params.brief,
      day_count: params.dayCount,
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
      include_lodging: params.includeLodging !== false,
    }),
  })

  if (!response.ok) {
    const message = await parseErrorResponse(response, 'Itinerary generation failed', {
      detail: 'Itinerary generation failed',
    })
    throw new Error(message)
  }

  const plan: AutobuildResponse = await response.json()
  return { ...plan, steps: plan.steps ?? [] }
}
