import type { DebugResponse } from '../api'

export type ResultTab = 'final' | 'transcript' | 'classification' | 'article' | 'title'

export type LexicalCopyStatus = 'idle' | 'loading' | 'success' | 'error'

export type Stage0Data = Record<string, unknown>

export type Stage1Data = {
  cleaned_transcript?: string
}

export type Stage2Data = {
  debug_prompt?: string
  debug_raw_response?: string
  classification?: string
  confidence?: number
  reasoning?: string
}

export type Stage3Data = {
  debug_coverage_prompt?: string
  debug_coverage_response?: string
  debug_supplement_prompt?: string
  debug_supplement_response?: string
  debug_composition_prompt?: string
  debug_composition_response?: string
  article_type?: string
  coverage_sufficient?: boolean
  coverage_analysis?: string
  missing_sections?: string[]
  supplemental_content?: string
  final_article?: string
  guideline_used?: string
}

export type Stage4Data = {
  debug_prompt?: string
  debug_raw_response?: string
  title?: string
  content?: string
  article_type?: string
  title_guideline_used?: string
}

export type StageEditorialAugmentationData = {
  augmented_content?: string
  components_added?: Array<{
    component?: string
    justification?: string
    placement?: string
  }>
  diagnostic?: {
    cognitive_load?: 'strong' | 'weak'
    narrative_density?: 'strong' | 'weak'
    emphasis_clarity?: 'strong' | 'weak'
    reading_behavior_risk?: 'strong' | 'weak'
  }
  augmentation_summary?: string
  augmentation_applied?: boolean
  debug_prompt?: string
  debug_raw_response?: string
  error?: string | null
}

export type TypedDebugStages = {
  stage_0?: { data?: Stage0Data }
  stage_1?: { data?: Stage1Data }
  stage_2?: { data?: Stage2Data }
  stage_3?: { data?: Stage3Data }
  stage_editorial_augmentation?: { data?: StageEditorialAugmentationData }
  stage_4?: { data?: Stage4Data }
}

export type DebugData = DebugResponse | undefined

export type ExpansionPhase = 'idle' | 'detecting' | 'personalizing' | 'analyzing' | 'expanding' | 'rewriting' | 'completed' | 'error'

export type ListicleDetection = {
  is_listicle: boolean
  list_type: string | null
  list_topic: string | null
  detected_items: string[]
}
