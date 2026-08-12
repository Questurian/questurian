import { apiFetch } from '../../../shared/api/client/apiFetch'
import { FEATURE_PREFIX } from '../constants/url2blog.constants'
import type { ArticleType } from '@shared/types'
import type { ToneProfile } from '../../../shared/api/ai/models'
import type {
  Url2BlogDebugRunResponse,
  Url2BlogPipelineV2Request,
  Url2BlogPipelineV2Response,
  Url2BlogResultResponse,
  Url2BlogStatusResponse,
} from '../types/pipeline.types'
import { resolveErrorMessage } from './request-error'
import { URL2BLOG_PROGRESS_STEPS } from '../constants/pipeline-ui.constants'
import { finalizeStatusResponse, normalizePipelineStatus } from '../../pipelineRuns'

const URL2BLOG_PIPELINE_STAGES = URL2BLOG_PROGRESS_STEPS
  .map((step) => step.stage)
  .filter((stage): stage is string => Boolean(stage))

function normalizeUrl2BlogStatusResponse(
  value: unknown,
  fallbackRunId: string,
): Url2BlogStatusResponse {
  const normalized = normalizePipelineStatus({
    value,
    stages: URL2BLOG_PIPELINE_STAGES,
    defaults: {
      run_id: fallbackRunId,
      state: 'pending',
      stage: 'stage_1',
      updated_at: '',
      error: null,
    } satisfies Url2BlogStatusResponse,
  })

  return finalizeStatusResponse(normalized, { fallbackRunId })
}

export async function runUrl2BlogPipelineV2(
  payload: Url2BlogPipelineV2Request,
): Promise<Url2BlogPipelineV2Response> {
  const response = await apiFetch(`${FEATURE_PREFIX}/pipeline-v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'URL2Blog pipeline v2 failed'))
  }

  return response.json()
}

export async function fetchToneProfiles(): Promise<ToneProfile[]> {
  const response = await apiFetch(`${FEATURE_PREFIX}/tones`)
  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'URL2Blog tone fetch failed'))
  }
  const payload = await response.json()
  return Array.isArray(payload?.tones) ? payload.tones : []
}

export async function fetchArticleTypes(): Promise<ArticleType[]> {
  const response = await apiFetch('/article-types')
  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'Article type fetch failed'))
  }
  return response.json()
}

export async function fetchStatus(
  runId: string,
  options: { allowNotFound?: boolean } = {},
): Promise<Url2BlogStatusResponse | null> {
  const response = await apiFetch(`${FEATURE_PREFIX}/status/${runId}`)

  if (response.status === 404) {
    if (options.allowNotFound) {
      // During request bootstrap we allow a brief not-found race.
      return null
    }
    throw new Error(
      `Run not found for ${runId}. This usually means backend instances are not sharing the same pipeline DB path.`,
    )
  }

  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'URL2Blog status fetch failed'))
  }

  return normalizeUrl2BlogStatusResponse(await response.json(), runId)
}

export async function fetchLatestStatus(): Promise<Url2BlogStatusResponse | null> {
  const response = await apiFetch(`${FEATURE_PREFIX}/status-latest`)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'URL2Blog latest status fetch failed'))
  }
  return normalizeUrl2BlogStatusResponse(await response.json(), '')
}

export async function fetchRunDebug(runId: string): Promise<Url2BlogDebugRunResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/debug/${runId}`)
  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'URL2Blog run debug fetch failed'))
  }
  return response.json()
}

export async function fetchResult(runId: string): Promise<Url2BlogResultResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/result/${runId}`)
  if (!response.ok) {
    throw new Error('Result fetch failed')
  }
  return response.json()
}
