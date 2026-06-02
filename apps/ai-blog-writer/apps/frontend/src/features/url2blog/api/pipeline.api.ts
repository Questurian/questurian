import { API_BASE_URL, FEATURE_PREFIX } from '../constants/url2blog.constants'
import type {
  Url2BlogPipelineV2Request,
  Url2BlogPipelineV2Response,
  Url2BlogResultResponse,
  Url2BlogStatusResponse,
} from '../types/pipeline.types'
import { resolveErrorMessage } from './request-error'
import { URL2BLOG_PROGRESS_STEPS } from '../constants/pipeline-ui.constants'
import { normalizePipelineStatus } from '../../pipelineRuns/progress'

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

  return {
    ...normalized,
    run_id: typeof normalized.run_id === 'string' ? normalized.run_id : fallbackRunId,
    updated_at: typeof normalized.updated_at === 'string' ? normalized.updated_at : '',
    error: typeof normalized.error === 'string' ? normalized.error : null,
  }
}

export async function runUrl2BlogPipelineV2(
  payload: Url2BlogPipelineV2Request,
): Promise<Url2BlogPipelineV2Response> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/pipeline-v2`, {
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

export async function fetchStatus(
  runId: string,
  options: { allowNotFound?: boolean } = {},
): Promise<Url2BlogStatusResponse | null> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/status/${runId}`)

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
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/status-latest`)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'URL2Blog latest status fetch failed'))
  }
  return normalizeUrl2BlogStatusResponse(await response.json(), '')
}

export async function fetchResult(runId: string): Promise<Url2BlogResultResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/result/${runId}`)
  if (!response.ok) {
    throw new Error('Result fetch failed')
  }
  return response.json()
}
