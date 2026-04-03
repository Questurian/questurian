import type { EditorAssistModelName } from './models'

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

export type ListicleWriterArticleType = 'single-type-listicle' | 'listicle-itinerary'
export type ListicleWriterFieldType = 'intro' | 'blurb'
export type ListicleWriterCategory = 'dining' | 'accommodations' | 'attractions' | 'nightlife' | 'key_location'

export type GenerateListicleContentTarget = {
  targetId: string
  fieldType: ListicleWriterFieldType
  category?: ListicleWriterCategory
  displayName?: string
  researchSubject?: string
  locationLabel?: string
  currentContent?: string
  supportingContext?: string
}

export type GenerateListicleContentRequest = {
  articleTitle: string
  articleType: ListicleWriterArticleType
  locationLabel: string
  articleContext?: string
  modelName?: EditorAssistModelName
  customInstruction?: string
  skipExisting?: boolean
  targets: GenerateListicleContentTarget[]
}

export type GenerateListicleContentTargetResponse = {
  target_id: string
  status: 'generated' | 'skipped' | 'error'
  markdown?: string | null
  model_used: string
  source_urls: string[]
  validation_errors: string[]
  error_message?: string | null
}

export type GenerateListicleContentResponse = {
  results: Record<string, GenerateListicleContentTargetResponse>
}
