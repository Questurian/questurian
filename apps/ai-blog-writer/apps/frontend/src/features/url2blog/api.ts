const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'
const FEATURE_PREFIX = '/url2blog'

export type ExtractResponse = {
  message: string
  source_url: string
  raw_text_length: number
  raw_response: string
  parsed: { title: string; content: string; language: string } | null
  parse_error: string | null
  translated: { title: string; content: string } | null
  translation_skipped: boolean
  translation_error: string | null
}

export type Stage2ClassifyResponse = {
  message: string
  classification: {
    id: number
    name: string
    definition: string
    confidence: number
    reasoning: string
  }
  article_types_considered: number
  raw_response: string
}

export type Url2BlogPipelineV2Request = {
  url: string
  include_debug?: boolean
  narrative_focus?: string
  enable_web_enrichment?: boolean
  enable_editorial_augmentation?: boolean
  execution_profile?: Url2BlogExecutionProfile
  max_external_context_items?: number
  model_name?: Url2BlogModel
}

export type Url2BlogModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.0-flash'
export type Url2BlogExecutionProfile = 'standard' | 'lean'

export type Url2BlogPipelineV2Response = {
  message: string
  pipeline_status: 'ready_for_drafting' | 'needs_revision'
  article: {
    source_url: string
    original_title: string
    original_excerpt: string
    language: string
    original_language: string
    translated: boolean
    translation_error?: string
  }
  selected_article_type: {
    id: number | null
    name: string
    confidence: number | null
    reasoning: string
  }
  guideline_meta: {
    id: number
    name: string
  }
  improved_article: {
    title: string
    content: string
  }
  final_markdown: string
  guideline_review: {
    alignment_summary: string
    improvements_applied: string[]
    remaining_gaps: string[]
    narrative_focus_applied?: string
    model_used?: Url2BlogModel
    execution_profile?: Url2BlogExecutionProfile
    source_word_count?: number
    final_word_count?: number
    min_expanded_word_target?: number
    length_requirement_met?: boolean
    length_requirement_blocking_reason?: string
    length_expansion_applied?: boolean
    length_expansion_passes?: number
    length_expansion_summary?: string
    short_article_enrichment_applied?: boolean
    external_context_points_used?: number
    external_context_usage_note?: string
    source_facts_extracted_count?: number
    factual_coverage_summary?: string
    factual_coverage_score?: number
    missing_source_facts_count?: number
    missing_high_priority_facts_count?: number
    fact_repair_applied?: boolean
    quality_summary?: string
    editorial_augmentation_applied?: boolean
    editorial_components_added?: Array<
      | 'pull_quote'
      | 'in_the_know_box'
      | 'key_takeaways_box'
      | 'highlight_callout'
      | 'faq_block'
    >
    editorial_augmentation_summary?: string
    editorial_diagnostic?: {
      cognitive_load: 'strong' | 'weak'
      narrative_density: 'strong' | 'weak'
      emphasis_clarity: 'strong' | 'weak'
      reading_behavior_risk: 'strong' | 'weak'
    }
    quality_scores?: {
      overall: number
      guideline_coverage: number
      informativeness: number
      originality: number
    }
    second_pass_applied?: boolean
    similarity_ngram_overlap?: number
    json_parse_failures_total?: number
    json_parse_recovered_calls?: number
    json_parse_recovered_failures?: number
    json_parse_failures_by_stage?: Record<string, number>
  }
  debug?: {
    guideline: {
      id: number
      name: string
      guideline: string
      title_guideline: string
    }
    article_original_content: string
    stage1: ExtractResponse
    stage2: Stage2ClassifyResponse
    rewrite_raw_response: string
    repair_raw_response?: string
    quality_raw_response?: string
    quality_required_revisions?: string[]
    narrative_focus?: string
    model_name?: Url2BlogModel
    external_context_points?: Array<{
      insight: string
      why_it_matters: string
      source_url: string
      confidence: 'high' | 'medium'
    }>
    external_context_usage_note?: string
    external_context_raw_response?: string
    external_context_grounded_urls?: string[]
    source_fact_anchors?: Array<{
      fact_id: string
      fact: string
      priority: 'high' | 'medium'
      category: 'numbers' | 'names' | 'amenities' | 'policies' | 'pricing' | 'logistics' | 'other'
    }>
    source_facts_raw_response?: string
    fact_coverage_raw_response?: string
    fact_coverage_missing_facts?: Array<{
      fact_id: string
      fact: string
      priority: 'high' | 'medium'
      reason: string
    }>
    fact_repair_raw_response?: string
    length_expansion_raw_response?: string
    editorial_augmentation_raw_response?: string
    editorial_components_added?: Array<{
      component:
        | 'pull_quote'
        | 'in_the_know_box'
        | 'key_takeaways_box'
        | 'highlight_callout'
        | 'faq_block'
      justification: string
      placement: string
    }>
    editorial_diagnostic?: {
      cognitive_load: 'strong' | 'weak'
      narrative_density: 'strong' | 'weak'
      emphasis_clarity: 'strong' | 'weak'
      reading_behavior_risk: 'strong' | 'weak'
    }
    json_parse_metrics?: {
      total_parse_failures: number
      recovered_calls: number
      recovered_parse_failures: number
      failures_by_stage: Record<string, number>
    }
  }
}

export async function runUrl2BlogPipelineV2(
  payload: Url2BlogPipelineV2Request
): Promise<Url2BlogPipelineV2Response> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/pipeline-v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'URL2Blog pipeline v2 failed' }))
    throw new Error(errorData.detail || 'URL2Blog pipeline v2 failed')
  }

  return response.json()
}
