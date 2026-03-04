export type SynthesizeResponse = {
  synthesized: string
}

export type Prompt2BlogPipelineStartRequest = {
  cleaned_data: string
  raw_sources: string[]
  writing_brief: Record<string, unknown>
  article_type_id: number
  include_debug?: boolean
  enable_editorial_augmentation?: boolean
  model_name?: string
}

export type Prompt2BlogPipelineStartResponse = {
  message: string
  run_id: string
}

export type Prompt2BlogRunRequest = {
  raw_sources: string[]
  writing_brief: Record<string, unknown>
  include_debug?: boolean
  enable_editorial_augmentation?: boolean
  model_name?: string
}

export type Prompt2BlogRunResponse = {
  message: string
  run_id: string
}

export type Prompt2BlogStatusResponse = {
  run_id: string
  feature: string
  state: 'pending' | 'running' | 'completed' | 'failed'
  stage: string
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
