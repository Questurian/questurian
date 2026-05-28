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
