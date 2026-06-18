import type { EditorAssistModelName } from '../../../../shared/api/ai/models'

export type RewriteBlockWithAiResponse = {
  rewritten_content: string
  model_used: string
}

export type RewriteBlockWithAiRequest = {
  prompt: string
  blockContent: string
  modelName?: EditorAssistModelName
  articleTitle?: string
  articleContext?: string
}

export type GenerateTitleWithAiRequest = {
  currentTitle: string
  prompt: string
  modelName?: EditorAssistModelName
}

export type GenerateTitleWithAiResponse = {
  title: string
}

export type ComposeItineraryBriefRequest = {
  travelerTypes: string[]
  motivations: string[]
  interests: string[]
  budget?: string
  accommodations: string[]
  practicalNeeds: string[]
  notes?: string
  locationLabel?: string
  dayCount?: number
  articleTitle?: string
  modelName?: EditorAssistModelName
}

export type ComposeItineraryBriefResponse = {
  brief: string
  model_used: string
}

export type ComposeItineraryIntroStop = {
  title: string
  category?: string
  dayLabel?: string
  selectionReason?: string
}

export type ComposeItineraryIntroRequest = {
  articleTitle: string
  locationLabel: string
  listTone?: ListicleWriterListTone
  planOverview?: string
  dayCount?: number
  stops: ComposeItineraryIntroStop[]
  modelName?: EditorAssistModelName
}

export type ComposeIntroStepEvent = {
  name: string
  label: string
  status: 'ok' | 'warning' | 'failed'
  duration_ms: number
  model?: string | null
  prompt?: string | null
  output?: string | null
  details: Record<string, unknown>
}

export type ComposeItineraryIntroResponse = {
  intro: string
  model_used: string
  steps: ComposeIntroStepEvent[]
}

export type ComposeDayBlurbStop = {
  /** `${itemId}_blurb` — the same id the listicle writer uses for the stop. */
  targetId: string
  title: string
  category?: string
  daypart?: string
  angle?: ListicleWriterAngle | null
  selectionReason?: string
}

export type ComposeDayBlurbsNeighborStop = {
  title: string
  category?: string
}

export type ComposeDayBlurbsRequest = {
  articleTitle: string
  locationLabel: string
  listTone?: ListicleWriterListTone
  planOverview?: string
  /** The finished, reader-facing intro — framing input (ADR 0019). */
  intro?: string
  dayLabel?: string
  dayCount?: number
  /** Read-only edge stops for cross-day handoffs; never written. */
  prevDayLastStop?: ComposeDayBlurbsNeighborStop
  nextDayFirstStop?: ComposeDayBlurbsNeighborStop
  stops: ComposeDayBlurbStop[]
  modelName?: EditorAssistModelName
}

export type ComposeDayBlurbResult = {
  target_id: string
  status: 'generated' | 'error'
  markdown?: string | null
  validation_errors: string[]
}

export type ComposeDayBlurbsResponse = {
  model_used: string
  results: Record<string, ComposeDayBlurbResult>
  /** Step timeline, same shape as the Intro composer's report. */
  steps: ComposeIntroStepEvent[]
}

/**
 * Refine an operator's rough "why did you pick this?" note into an internal
 * Selection reason (ADR 0020). Internal planning register, not reader prose.
 */
export type ComposeStopReasonRequest = {
  /** The operator's rough, hand-written rationale — the substance. */
  roughReason: string
  title: string
  category?: string
  daypart?: string
  angle?: ListicleWriterAngle | null
  articleTitle?: string
  locationLabel?: string
  planOverview?: string
  modelName?: EditorAssistModelName
}

export type ComposeStopReasonResponse = {
  reason: string
  model_used: string
}

export type ListicleGuidelinesResponse = {
  angles: Record<string, string>
  tones: Record<string, string>
}

export type ListicleWriterArticleType = 'single-type-listicle' | 'listicle-itinerary'
export type ListicleWriterFieldType = 'intro' | 'blurb'
export type ListicleWriterCategory = 'dining' | 'accommodations' | 'attractions' | 'nightlife' | 'key_location'
export type ListicleWriterListTone =
  | 'elevated'
  | 'casual'
  | 'hidden-gem'
  | 'family-friendly'
  | 'date-night'
  | 'budget'

export type PayloadCollectionSlug =
  | 'dining'
  | 'accommodations'
  | 'attractions'
  | 'nightlife'
  | 'key-locations'

export type ListicleWriterAngle =
  // Dining
  | 'signature-dish'
  | 'atmosphere'
  | 'founders-backstory'
  | 'insider-tip'
  | 'best-for'
  | 'whats-different'
  // Accommodations (ADR 0011)
  | 'location-and-setting'
  | 'view-and-vista'
  | 'design-and-aesthetic'
  | 'signature-amenity'
  | 'food-and-beverage'
  | 'trip-fit'
  | 'property-backstory'
  | 'booking-tip'
  // Attractions
  | 'signature-feature'
  | 'setting'
  | 'history-built'
  | 'visit-time-tip'
  | 'best-for-visit-type'
  // Nightlife (single-angle pool per ADR 0008)
  | 'best-for-night'

export type GenerateListicleContentTarget = {
  targetId: string
  fieldType: ListicleWriterFieldType
  category?: ListicleWriterCategory
  displayName?: string
  researchSubject?: string
  locationLabel?: string
  currentContent?: string
  supportingContext?: string
  payloadDocId?: string
  payloadCollection?: PayloadCollectionSlug
  angle?: ListicleWriterAngle | null
}

export type GenerateListicleContentRequest = {
  articleTitle: string
  articleType: ListicleWriterArticleType
  locationLabel: string
  articleContext?: string
  modelName?: EditorAssistModelName
  customInstruction?: string
  skipExisting?: boolean
  listTone?: ListicleWriterListTone
  targets: GenerateListicleContentTarget[]
}

export type ListicleStepEventName =
  | 'critical_fields_evaluated'
  | 'evidence_profile_completed'
  | 'research_profile_completed'
  | 'writer_brief_completed'
  | 'writer_called'
  | 'validated'
  | 'retry_called'
  | 'finalized'

export type ListicleStepEventStatus = 'ok' | 'skipped' | 'failed'

export type ListicleStepEvent = {
  name: ListicleStepEventName
  status: ListicleStepEventStatus
  prompt?: string | null
  output?: string | null
  model?: string | null
  details: Record<string, unknown>
  duration_ms: number
}

export type GenerateListicleContentTargetResponse = {
  target_id: string
  status: 'generated' | 'skipped' | 'error'
  markdown?: string | null
  model_used: string
  source_urls: string[]
  validation_errors: string[]
  error_message?: string | null
  low_confidence?: boolean
  warnings?: string[]
  requested_angle?: ListicleWriterAngle | null
  effective_angle?: ListicleWriterAngle | null
  steps?: ListicleStepEvent[]
}

export type GenerateListicleContentResponse = {
  results: Record<string, GenerateListicleContentTargetResponse>
}
