import { API_BASE_URL, FEATURE_PREFIX } from '../constants/prompt2blog.constants'
import { parseError } from '../../../shared/api/errors/parse-error'
import type {
  Prompt2BlogDebugResponse,
  Prompt2BlogGuidelinePreviewResponse,
  Prompt2BlogInputOptionsResponse,
  Prompt2BlogPipelineStage,
  Prompt2BlogResultResponse,
  Prompt2BlogRunRequest,
  Prompt2BlogRunResponse,
  Prompt2BlogStatusResponse,
} from '../types/pipeline.types'
import { PROMPT2BLOG_PIPELINE_STAGES } from '../types/pipeline.types'

const PROMPT2BLOG_STATUS_STATES = ['pending', 'running', 'completed', 'failed'] as const

type Prompt2BlogStatusState = Prompt2BlogStatusResponse['state']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function resolvePrompt2BlogPipelineStage(value: unknown): Prompt2BlogPipelineStage {
  return PROMPT2BLOG_PIPELINE_STAGES.includes(value as Prompt2BlogPipelineStage)
    ? value as Prompt2BlogPipelineStage
    : 'queued'
}

function resolvePrompt2BlogStatusState(value: unknown): Prompt2BlogStatusState {
  return PROMPT2BLOG_STATUS_STATES.includes(value as Prompt2BlogStatusState)
    ? value as Prompt2BlogStatusState
    : 'pending'
}

export function normalizePrompt2BlogStatusResponse(
  value: unknown,
  fallbackRunId: string,
): Prompt2BlogStatusResponse {
  const record = isRecord(value) ? value : {}

  return {
    run_id: typeof record.run_id === 'string' ? record.run_id : fallbackRunId,
    feature: typeof record.feature === 'string' ? record.feature : 'prompt2blog',
    state: resolvePrompt2BlogStatusState(record.state),
    stage: resolvePrompt2BlogPipelineStage(record.stage),
    error: typeof record.error === 'string' ? record.error : null,
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : '',
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
