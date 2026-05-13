import { API_BASE_URL } from '../../shared/api/client/config'

export type KeywordIntelMarketProfile =
  | 'us_planners_en'
  | 'tourists_in_peru_en'
  | 'locals_peru_es'
  | 'custom'

export type KeywordIntelRunRequest = {
  seed: string
  market_profile?: KeywordIntelMarketProfile
  geo?: string
  language?: string
  device?: 'desktop' | 'mobile'
  search_domain?: string
  region?: string
  city?: string
}

export type KeywordIntelStatusResponse = {
  run_id: string
  feature: string
  state: 'running' | 'completed' | 'failed' | string
  stage: string
  error?: string | null
  updated_at?: string
}

export type KeywordIntelPhraseRecord = {
  phrase_id: string
  text: string
  normalized_text: string
  source_type: 'autocomplete' | 'related_searches' | 'people_also_search' | string
  provider: 'dataforseo' | string
  source_rank: number | null
  seed: string
  market_profile: string
  geo: string
  language: string
  device: string | null
  search_domain: string | null
  region: string | null
  city: string | null
  filter_reason?: string | null
  is_near_seed?: boolean
  platform_modifiers?: string[]
  topic_label?: string | null
  intent_label?: string | null
  intent_relation?: string | null
  classification_reason?: string | null
  classification_source?: string | null
  source_types?: string[]
  source_phrase_ids?: string[]
  source_ranks?: Array<number | null>
}

export type KeywordIntelCollectionDebug = {
  market_context?: KeywordIntelMarketContext
  provider_request_context?: {
    method: string
    path: string
    payload?: unknown
    market_context?: KeywordIntelMarketContext
  }
  raw_provider_response?: unknown
  phrase_records?: KeywordIntelPhraseRecord[]
  count?: number
}

export type KeywordIntelPatternSummary = {
  top_modifiers: string[]
  top_entities: string[]
  recurring_location_anchors: string[]
  recurring_question_stems: string[]
  recurring_feature_terms: string[]
  platform_modifiers?: string[]
}

export type KeywordIntelMarketContext = {
  market_profile: string
  provider: string
  geo: string
  language: string
  device: string
  search_domain?: string | null
  region?: string | null
  city?: string | null
  location_code: number
  location_name: string
  location_type: string
  language_code: string
  language_name: string
}

export type KeywordIntelGroup = {
  group_id: string
  label: string
  phrase_ids: string[]
  phrases: string[]
  modifier_tags?: string[]
  score: number
}

export type KeywordIntelResultArtifact = {
  seed: string
  geo: string
  language: string
  raw_phrases: string[]
  clean_phrases: string[]
  filtered_out_phrases: string[]
  pattern_summary: KeywordIntelPatternSummary
  groups: KeywordIntelGroup[]
  market_context: KeywordIntelMarketContext
  raw_phrase_records: KeywordIntelPhraseRecord[]
  normalized_phrase_records: KeywordIntelPhraseRecord[]
  retained_phrase_records: KeywordIntelPhraseRecord[]
  filtered_out_phrase_records: KeywordIntelPhraseRecord[]
  debug_artifacts: {
    collect_autocomplete_records?: KeywordIntelCollectionDebug
    collect_related_search_records?: KeywordIntelCollectionDebug
    normalize_exact_text?: {
      normalized_phrase_records?: KeywordIntelPhraseRecord[]
      dropped_records?: KeywordIntelPhraseRecord[]
      count?: number
    }
    classify_phrase_intent_ai?: {
      seed_intent_profile?: {
        topic_label?: string
        intent_label?: string
        anchor_tokens?: string[]
      }
      classified_phrase_records?: KeywordIntelPhraseRecord[]
      count?: number
    }
    filter_irrelevant_phrases_ai?: {
      retained_phrase_records?: KeywordIntelPhraseRecord[]
      filtered_out_phrase_records?: KeywordIntelPhraseRecord[]
      retained_count?: number
      filtered_count?: number
    }
  }
}

export type KeywordIntelResultResponse = {
  run_id: string
  artifact: KeywordIntelResultArtifact
}

export type KeywordIntelRunResponse = {
  message: string
  run_id: string
}

export type KeywordIntelJobSummary = {
  run_id: string
  seed: string
  market_profile: string
  geo: string
  language: string
  state: string
  stage: string
  updated_at: string
  raw_phrase_count: number
  clean_phrase_count: number
  filtered_out_phrase_count: number
  group_count: number
}

const FEATURE_PREFIX = '/keyword-intel'

async function parseError(response: Response, fallback: string): Promise<Error> {
  const errorData = await response.json().catch(() => ({ detail: fallback }))
  const detail =
    (typeof errorData?.detail === 'string' && errorData.detail) ||
    (typeof errorData?.message === 'string' && errorData.message) ||
    fallback
  return new Error(detail)
}

export async function runKeywordIntel(
  payload: KeywordIntelRunRequest,
): Promise<KeywordIntelRunResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw await parseError(response, 'Keyword-intel run failed to start')
  }

  return response.json()
}

export async function getKeywordIntelStatus(runId: string): Promise<KeywordIntelStatusResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/status/${runId}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch keyword-intel status')
  }

  return response.json()
}

export async function getKeywordIntelResult(runId: string): Promise<KeywordIntelResultResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/result/${runId}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch keyword-intel result')
  }

  return response.json()
}

export async function getKeywordIntelJobs(limit = 20): Promise<KeywordIntelJobSummary[]> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/jobs?limit=${limit}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch keyword-intel jobs')
  }

  return response.json()
}
