export type Prompt2BlogModelName =
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.1-flash-lite-preview'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-2.0-flash'

// Writing-quality model for the compose / editorial stages, independent of the
// base drafting model. Backend allowlist: app/shared/writer_models.py.
export type Prompt2BlogWriterModel =
  | 'claude-opus-4-8'
  | 'claude-opus-4-7'
  | 'claude-sonnet-5'
  | 'gemini-3.1-pro-preview'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'

export type Prompt2BlogInputOption = {
  id: string
  label: string
  description?: string
  instructions?: string
  default?: boolean
  order?: number
  paragraph_length?: string
  target_word_count?: number
}

export type Prompt2BlogArticleTypeOption = {
  id: number
  name: string
  definition: string
}

export type Prompt2BlogInputOptionsResponse = {
  article_types: Prompt2BlogArticleTypeOption[]
  tones: Prompt2BlogInputOption[]
  lengths: Prompt2BlogInputOption[]
  brand_voices: Prompt2BlogInputOption[]
  defaults: {
    tone_id: string
    length_id: string
    brand_voice_id: string
  }
}

export type Prompt2BlogGuidelinePreviewResponse = {
  id: number
  name: string
  guideline: string
  title_guideline: string
  guideline_file?: string | null
  title_guideline_file?: string | null
}

export type Prompt2BlogRunRequest = {
  article_type_id: number
  source_material: string[]
  article_goal: string
  target_reader: string
  destination_context: string
  tone_id: string
  length_id: string
  brand_voice_id?: string
  primary_keyword?: string
  secondary_keywords?: string[]
  call_to_action?: string
  must_include?: string[]
  audience_profile?: string
  prompt_enhance?: boolean
  creativity_level?: 'low' | 'medium' | 'high'
  negative_instructions?: string[]
  include_debug?: boolean
  enable_editorial_augmentation?: boolean
  model_name?: Prompt2BlogModelName
  writing_model?: Prompt2BlogWriterModel
}

export type Prompt2BlogRunResponse = {
  message: string
  run_id: string
}

export const PROMPT2BLOG_PIPELINE_STAGES = [
  'queued',
  'stage_input_validate',
  'stage_input_cleanup',
  'stage_synthesize_sources',
  'stage_guideline_fetch',
  'stage_coverage_check',
  'stage_supplement',
  'stage_compose',
  'stage_quality_audit',
  'stage_repair',
  'stage_editorial_augmentation',
  'stage_title',
  'stage_finalize',
  'complete',
] as const

export type KnownPrompt2BlogPipelineStage = typeof PROMPT2BLOG_PIPELINE_STAGES[number]
export type Prompt2BlogPipelineStage = KnownPrompt2BlogPipelineStage | 'unknown'

export type Prompt2BlogStatusResponse = {
  run_id: string
  feature: string
  state: 'pending' | 'running' | 'completed' | 'failed'
  stage: Prompt2BlogPipelineStage
  raw_stage?: string | null
  error: string | null
  updated_at: string
}

export type Prompt2BlogStageTrace = {
  stage: string
  model_name?: string
  input?: unknown
  prompt?: string
  raw_response?: string
  parsed?: unknown
  output?: unknown
  skipped?: boolean
  error?: string
}

export type Prompt2BlogPipelinePayload = {
  message: string
  run_id: string
  langsmith_trace_url?: string
  langsmith_trace_run_id?: string
  pipeline_status: 'ready_for_staging' | 'needs_revision'
  article_type: {
    id: number
    name: string
    definition: string
  }
  guideline_meta: {
    guideline: string
    title_guideline: string
    guideline_file?: string | null
    title_guideline_file?: string | null
  }
  input_profiles?: {
    tone?: Record<string, unknown>
    length?: Record<string, unknown>
    brand_voice?: Record<string, unknown>
    creativity_level?: string
  }
  improved_article: {
    title: string
    content: string
  }
  final_markdown: string
  quality_review: {
    alignment_summary: string
    improvements_applied: string[]
    remaining_gaps: string[]
    quality_summary: string
    quality_scores: {
      overall: number
      guideline_coverage: number
      informativeness: number
      originality: number
      brief_adherence: number
      seo: number
    }
    constraint_checks: {
      target_word_count_met: boolean
      paragraph_length_met: boolean
      cta_present: boolean
      primary_keyword_present: boolean
      secondary_keywords_present: boolean
      audience_match: boolean
      tone_match: boolean
    }
    secondary_keyword_coverage: number
    word_count_estimate: number
    repair_applied: boolean
    editorial_augmentation_applied: boolean
    editorial_components_added: Array<{
      component: string
      justification: string
      placement: string
    }>
    editorial_augmentation_summary: string
    editorial_diagnostic: {
      cognitive_load: 'strong' | 'weak'
      narrative_density: 'strong' | 'weak'
      emphasis_clarity: 'strong' | 'weak'
      reading_behavior_risk: 'strong' | 'weak'
    }
    coverage: {
      coverage_sufficient: boolean
      analysis: string
      missing_sections: string[]
    }
    model_used: string
  }
  debug?: {
    pipeline_input: {
      article_type_id: number
      model_name: string
      include_debug: boolean
      enable_editorial_augmentation?: boolean
      raw_sources_count: number
    }
    writing_brief: Record<string, unknown>
    pipeline_trace?: Prompt2BlogStageTrace[]
  }
}

export type Prompt2BlogResultResponse = {
  run_id: string
  langsmith_trace_url?: string
  langsmith_trace_run_id?: string
  markdown: string
  artifact: {
    pipeline_v2?: Prompt2BlogPipelinePayload
    stages?: Record<string, unknown>
  }
}

export type Prompt2BlogDebugResponse = {
  run_id: string
  status: Prompt2BlogStatusResponse
  stages: Record<string, unknown>
  output:
    | {
        markdown: string
        artifact: {
          pipeline_v2?: Prompt2BlogPipelinePayload
          stages?: Record<string, unknown>
        }
      }
    | null
}

export type Prompt2BlogDebugStages = Prompt2BlogDebugResponse['stages']
