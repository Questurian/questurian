import { apiFetch } from '../../../shared/api/client/apiFetch'
import { FEATURE_PREFIX } from '../constants/prompt2blog.constants'
import { parseError } from '../../../shared/api/errors/parse-error'
import type {
  Prompt2BlogDebugResponse,
  Prompt2BlogInputOptionsResponse,
  Prompt2BlogPipelineStage,
  Prompt2BlogResultResponse,
  Prompt2BlogRunRequest,
  Prompt2BlogRunResponse,
  Prompt2BlogStatusResponse,
  Prompt2BlogV3StartResponse,
} from '../types/pipeline.types'
import type { Prompt2BlogV3Request } from '../types/editorial.types'
import { PROMPT2BLOG_KNOWN_PIPELINE_STAGES } from '../types/pipeline.types'
import { finalizeStatusResponse, normalizePipelineStatus } from '../../pipelineRuns'

export function normalizePrompt2BlogStatusResponse(
  value: unknown,
  fallbackRunId: string,
): Prompt2BlogStatusResponse {
  const normalized = normalizePipelineStatus({
    value,
    stages: PROMPT2BLOG_KNOWN_PIPELINE_STAGES,
    unknownStage: 'unknown' satisfies Prompt2BlogPipelineStage,
    rawStageField: 'raw_stage',
    defaults: {
      run_id: fallbackRunId,
      feature: 'prompt2blog',
      state: 'pending',
      stage: 'queued',
      error: null,
      updated_at: '',
    } satisfies Prompt2BlogStatusResponse,
  })

  return finalizeStatusResponse(normalized, { fallbackRunId, feature: 'prompt2blog' })
}

export async function startPrompt2BlogRun(
  payload: Prompt2BlogRunRequest,
): Promise<Prompt2BlogRunResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw await parseError(response, 'Prompt2Blog run failed to start')
  }

  return response.json()
}

/**
 * Starts a v3 run, or reports the research that has to happen first.
 *
 * `needs_research` arrives on a 200: the commission was valid and the gate ran,
 * it just found evidence that cannot support the article. Nothing was queued,
 * so it is a result to show, not an error to throw.
 */
export async function startPrompt2BlogV3Run(
  payload: Prompt2BlogV3Request,
): Promise<Prompt2BlogV3StartResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/pipeline-v3`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw await parseError(response, 'Prompt2Blog v3 run failed to start')
  }

  const body = (await response.json()) as Prompt2BlogV3StartResponse
  if (body?.status === 'queued' && typeof body.run_id === 'string' && body.run_id) {
    return body
  }
  if (body?.status === 'needs_research') return body
  throw new Error('Prompt2Blog v3 returned an unrecognized start response.')
}

export async function getPrompt2BlogInputOptions(): Promise<Prompt2BlogInputOptionsResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/input-options`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog input options')
  }

  return response.json()
}

export async function getPrompt2BlogStatus(runId: string): Promise<Prompt2BlogStatusResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/status/${runId}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog run status')
  }

  return normalizePrompt2BlogStatusResponse(await response.json(), runId)
}

export async function getPrompt2BlogResult(runId: string): Promise<Prompt2BlogResultResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/result/${runId}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog run result')
  }

  return response.json()
}

/**
 * Staging-facing stable alias for {@link getPrompt2BlogResult}. The shared
 * editorial-staging layer (`EditorialStageArticleApi.fetchResult`) consumes a
 * `fetchResult` method, and url2blog/youtube2blog expose theirs under that same
 * name. Keep this alias so `StageArticlePage` can wire prompt2blog into the
 * shared contract without leaking the feature-specific name.
 */
export async function fetchResult(runId: string): Promise<Prompt2BlogResultResponse> {
  return getPrompt2BlogResult(runId)
}

export async function getPrompt2BlogDebug(runId: string): Promise<Prompt2BlogDebugResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/debug/${runId}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog debug output')
  }

  return response.json()
}
