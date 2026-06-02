import type { ResultResponse, StatusResponse, UploadResponse } from '@shared/types'
import { API_BASE_URL, FEATURE_PREFIX } from '../constants/api.constants'
import { STAGE_ORDER } from '../constants/pipeline.constants'
import type { DebugResponse } from '../types/pipeline.types'
import { resolveErrorMessage } from './request-error'
import { normalizePipelineStatus } from '../../pipelineRuns/progress'

function normalizeYouTube2BlogStatusResponse(value: unknown, fallbackRunId: string): StatusResponse {
  const normalized = normalizePipelineStatus({
    value,
    stages: STAGE_ORDER,
    defaults: {
      run_id: fallbackRunId,
      state: 'pending',
      stage: 'stage_0',
      updated_at: '',
      error: null,
    } satisfies StatusResponse,
  })

  return {
    ...normalized,
    run_id: typeof normalized.run_id === 'string' ? normalized.run_id : fallbackRunId,
    updated_at: typeof normalized.updated_at === 'string' ? normalized.updated_at : '',
    error: typeof normalized.error === 'string' ? normalized.error : null,
  }
}

export async function startFromYoutubeUrl(
  url: string,
  model?: string,
  forcedArticleType?: string,
): Promise<UploadResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/from-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      ...(model ? { model } : {}),
      ...(forcedArticleType?.trim() ? { forced_article_type: forcedArticleType.trim() } : {}),
    }),
  })

  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'Failed to start YouTube URL run'))
  }

  return response.json()
}

export async function fetchStatus(runId: string): Promise<StatusResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/status/${runId}`)

  if (!response.ok) {
    throw new Error('Status fetch failed')
  }

  return normalizeYouTube2BlogStatusResponse(await response.json(), runId)
}

export async function fetchResult(runId: string): Promise<ResultResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/result/${runId}`)

  if (!response.ok) {
    throw new Error('Result fetch failed')
  }

  return response.json()
}

export function resultDownloadUrl(runId: string): string {
  return `${API_BASE_URL}${FEATURE_PREFIX}/result/${runId}?format=md`
}

export async function clearDatabase(): Promise<{
  message: string
  deleted_runs: number
}> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/clear`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error('Clear database failed')
  }

  return response.json()
}

export async function fetchDebug(runId: string): Promise<DebugResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/debug/${runId}`)

  if (!response.ok) {
    throw new Error('Debug fetch failed')
  }

  return response.json()
}
