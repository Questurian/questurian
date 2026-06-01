import { API_BASE_URL, FEATURE_PREFIX } from '../constants/url2blog.constants'
import type {
  Url2BlogPipelineV2Request,
  Url2BlogPipelineV2Response,
  Url2BlogResultResponse,
  Url2BlogStatusResponse,
} from '../types/pipeline.types'
import { resolveErrorMessage } from './request-error'

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

  return response.json()
}

export async function fetchLatestStatus(): Promise<Url2BlogStatusResponse | null> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/status-latest`)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(await resolveErrorMessage(response, 'URL2Blog latest status fetch failed'))
  }
  return response.json()
}

export async function fetchResult(runId: string): Promise<Url2BlogResultResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/result/${runId}`)
  if (!response.ok) {
    throw new Error('Result fetch failed')
  }
  return response.json()
}
