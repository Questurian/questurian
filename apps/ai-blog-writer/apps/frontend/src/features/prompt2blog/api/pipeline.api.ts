import { API_BASE_URL, FEATURE_PREFIX } from '../constants/prompt2blog.constants'
import { parseError } from '../../../shared/api/errors/parse-error'
import type {
  Prompt2BlogDebugResponse,
  Prompt2BlogGuidelinePreviewResponse,
  Prompt2BlogInputOptionsResponse,
  KnownPrompt2BlogPipelineStage,
  Prompt2BlogPipelineStage,
  Prompt2BlogResultResponse,
  Prompt2BlogRunRequest,
  Prompt2BlogRunResponse,
  Prompt2BlogStatusResponse,
} from '../types/pipeline.types'
import { PROMPT2BLOG_PIPELINE_STAGES } from '../types/pipeline.types'
import { normalizePipelineStatus } from '../../pipelineRuns/progress'

export function resolvePrompt2BlogPipelineStage(value: unknown): Prompt2BlogPipelineStage {
  return PROMPT2BLOG_PIPELINE_STAGES.includes(value as KnownPrompt2BlogPipelineStage)
    ? value as KnownPrompt2BlogPipelineStage
    : 'unknown'
}

function readStatusRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function resolveRawPrompt2BlogPipelineStage(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function normalizePrompt2BlogStatusResponse(
  value: unknown,
  fallbackRunId: string,
): Prompt2BlogStatusResponse {
  const record = readStatusRecord(value)
  const rawStage = resolveRawPrompt2BlogPipelineStage(record.stage)
  const normalized = normalizePipelineStatus({
    value,
    stages: PROMPT2BLOG_PIPELINE_STAGES,
    defaults: {
      run_id: fallbackRunId,
      feature: 'prompt2blog',
      state: 'pending',
      stage: 'queued',
      error: null,
      updated_at: '',
    } satisfies Prompt2BlogStatusResponse,
  })
  const stage = rawStage ? resolvePrompt2BlogPipelineStage(rawStage) : normalized.stage

  return {
    ...normalized,
    run_id: typeof normalized.run_id === 'string' ? normalized.run_id : fallbackRunId,
    feature: typeof normalized.feature === 'string' ? normalized.feature : 'prompt2blog',
    stage,
    ...(stage === 'unknown' ? { raw_stage: rawStage } : {}),
    error: typeof normalized.error === 'string' ? normalized.error : null,
    updated_at: typeof normalized.updated_at === 'string' ? normalized.updated_at : '',
  }
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

export async function getPrompt2BlogInputOptions(): Promise<Prompt2BlogInputOptionsResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/input-options`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog input options')
  }

  return response.json()
}

export async function getPrompt2BlogGuidelinePreview(
  articleTypeId: number,
): Promise<Prompt2BlogGuidelinePreviewResponse> {
  const response = await fetch(
    `${API_BASE_URL}${FEATURE_PREFIX}/article-types/${articleTypeId}/guideline-preview`,
  )

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog guideline preview')
  }

  return response.json()
}

export async function getPrompt2BlogStatus(runId: string): Promise<Prompt2BlogStatusResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/status/${runId}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog run status')
  }

  return normalizePrompt2BlogStatusResponse(await response.json(), runId)
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
