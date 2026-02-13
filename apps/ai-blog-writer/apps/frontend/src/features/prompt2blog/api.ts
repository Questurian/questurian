import {
  convertMarkdownToLexical,
  createArticle,
  fetchLocations,
  fetchMediaAssets,
  searchPexelsImages,
  searchUnsplashImages,
  getArticleSyncStatus as getArticleSyncStatusForFeature,
  markArticleSynced as markArticleSyncedForFeature,
  rewriteBlockWithAi,
  type CreateArticlePayload,
  type Location,
  type MediaAsset,
} from '../staging/api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'
const FEATURE_PREFIX = '/prompt2blog'

export type SynthesizeResponse = {
  synthesized: string
}

export type ArticleTypeOption = {
  name: string
  definition: string
}

export type ClassificationResult = {
  id: number
  name: string
  definition: string
  confidence: number
  reasoning: string
}

export type ClassifyResponse = {
  result: string
  classification: ClassificationResult
}

export type ArticleTypeGuidelines = {
  id: number
  name: string
  guideline: string | null
  title_guideline: string | null
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
  markdown: string
  artifact: {
    pipeline_v2?: Prompt2BlogPipelinePayload
    stages?: Record<string, unknown>
  }
}

export type Prompt2BlogSavedArticle = {
  run_id: string
  title: string | null
  article_type: string | null
  created_at: string
  updated_at: string
  markdown: string
  markdown_length: number
  synced_to_payload?: boolean
  payload_article_id?: number | null
  synced_at?: string | null
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

async function parseError(response: Response, fallback: string): Promise<Error> {
  const errorData = await response.json().catch(() => ({ detail: fallback }))
  const detail =
    (typeof errorData?.detail === 'string' && errorData.detail) ||
    (typeof errorData?.message === 'string' && errorData.message) ||
    fallback
  return new Error(detail)
}

export async function synthesizeSources(blobs: string[]): Promise<SynthesizeResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blobs }),
  })

  if (!response.ok) {
    throw await parseError(response, 'Synthesis request failed')
  }

  return response.json()
}

export async function fetchArticleTypes(): Promise<ArticleTypeOption[]> {
  const response = await fetch(`${API_BASE_URL}/article-types/name-definitions`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch article types')
  }

  return response.json()
}

export async function classifyArticleType(
  cleanedData: string,
  articleTypes: ArticleTypeOption[],
  writingBrief?: Record<string, unknown>,
): Promise<ClassifyResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cleaned_data: cleanedData,
      article_types: articleTypes,
      writing_brief: writingBrief,
    }),
  })

  if (!response.ok) {
    throw await parseError(response, 'Classification request failed')
  }

  return response.json()
}

export async function fetchArticleTypeGuidelinesById(
  articleTypeId: number,
): Promise<ArticleTypeGuidelines> {
  const response = await fetch(`${API_BASE_URL}/article-types/${articleTypeId}/guidelines`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch article guidelines')
  }

  return response.json()
}

export async function startPrompt2BlogPipelineV2(
  payload: Prompt2BlogPipelineStartRequest,
): Promise<Prompt2BlogPipelineStartResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/pipeline-v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw await parseError(response, 'Prompt2Blog pipeline v2 failed to start')
  }

  return response.json()
}

export async function startPrompt2BlogRun(
  payload: Prompt2BlogRunRequest,
): Promise<Prompt2BlogRunResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw await parseError(response, 'Prompt2Blog run failed to start')
  }

  return response.json()
}

export async function getPrompt2BlogStatus(runId: string): Promise<Prompt2BlogStatusResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/status/${runId}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog run status')
  }

  return response.json()
}

export async function getPrompt2BlogResult(runId: string): Promise<Prompt2BlogResultResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/result/${runId}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog run result')
  }

  return response.json()
}

export async function fetchResult(runId: string): Promise<Prompt2BlogResultResponse> {
  return getPrompt2BlogResult(runId)
}

export async function getPrompt2BlogDebug(runId: string): Promise<Prompt2BlogDebugResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/debug/${runId}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog debug output')
  }

  return response.json()
}

export async function fetchArticles(): Promise<Prompt2BlogSavedArticle[]> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/articles`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog articles')
  }

  return response.json()
}

export async function markArticleSynced(
  runId: string,
  payloadArticleId: number,
): Promise<{ message: string; run_id: string; payload_article_id: number }> {
  return markArticleSyncedForFeature(FEATURE_PREFIX, runId, payloadArticleId)
}

export async function getArticleSyncStatus(
  runId: string,
): Promise<{
  synced_to_payload: boolean
  payload_article_id: number | null
  synced_at: string | null
}> {
  return getArticleSyncStatusForFeature(FEATURE_PREFIX, runId)
}

export type { CreateArticlePayload, Location, MediaAsset }
export {
  convertMarkdownToLexical,
  fetchLocations,
  fetchMediaAssets,
  searchPexelsImages,
  searchUnsplashImages,
  createArticle,
  rewriteBlockWithAi,
}
