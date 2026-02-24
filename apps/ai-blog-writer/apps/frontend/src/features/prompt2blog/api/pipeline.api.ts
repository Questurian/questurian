import { API_BASE_URL, FEATURE_PREFIX } from '../constants/prompt2blog.constants'
import { parseError } from '../utils/parse-error'
import type {
  Prompt2BlogDebugResponse,
  Prompt2BlogPipelineStartRequest,
  Prompt2BlogPipelineStartResponse,
  Prompt2BlogResultResponse,
  Prompt2BlogRunRequest,
  Prompt2BlogRunResponse,
  Prompt2BlogStatusResponse,
  SynthesizeResponse,
} from '../types/pipeline.types'

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
