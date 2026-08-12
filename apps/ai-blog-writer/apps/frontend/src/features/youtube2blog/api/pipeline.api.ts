import type { ResultResponse, StatusResponse, UploadResponse } from '@shared/types'
import type { ToneProfile } from '../../../shared/api/ai/models'
import { apiFetch } from '../../../shared/api/client/apiFetch'
import { FEATURE_PREFIX } from '../constants/api.constants'
import { STAGE_ORDER } from '../constants/pipeline.constants'
import type { DebugResponse } from '../types/pipeline.types'
import { resolveErrorMessage } from './request-error'
import { finalizeStatusResponse, normalizePipelineStatus } from '../../pipelineRuns'

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

  return finalizeStatusResponse(normalized, { fallbackRunId })
}

export async function startFromYoutubeUrl(
  url: string,
  model?: string,
  forcedArticleType?: string,
  writingModel?: string,
  toneId?: string,
): Promise<UploadResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/from-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      ...(model ? { model } : {}),
      ...(forcedArticleType?.trim() ? { forced_article_type: forcedArticleType.trim() } : {}),
      ...(writingModel ? { writing_model: writingModel } : {}),
      ...(toneId ? { tone_id: toneId } : {}),
    }),
  })

  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'Failed to start YouTube URL run'))
  }

  return response.json()
}

export async function fetchStatus(runId: string): Promise<StatusResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/status/${runId}`)

  if (!response.ok) {
    throw new Error('Status fetch failed')
  }

  return normalizeYouTube2BlogStatusResponse(await response.json(), runId)
}

export async function fetchToneProfiles(): Promise<ToneProfile[]> {
  const response = await apiFetch(`${FEATURE_PREFIX}/tones`)

  if (!response.ok) {
    throw new Error('Tone profile fetch failed')
  }

  const payload = await response.json()
  return Array.isArray(payload?.tones) ? payload.tones : []
}

export async function fetchResult(runId: string): Promise<ResultResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/result/${runId}`)

  if (!response.ok) {
    throw new Error('Result fetch failed')
  }

  return response.json()
}

export async function clearDatabase(): Promise<{
  message: string
  deleted_runs: number
}> {
  const response = await apiFetch(`${FEATURE_PREFIX}/clear`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error('Clear database failed')
  }

  return response.json()
}

export async function fetchDebug(runId: string): Promise<DebugResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/debug/${runId}`)

  if (!response.ok) {
    throw new Error('Debug fetch failed')
  }

  return response.json()
}
