import { apiFetch } from '../../../shared/api/client/apiFetch'
import { parseError } from '../../../shared/api/errors/parse-error'
import { FEATURE_PREFIX } from '../constants/prompt2blog.constants'
import type { Prompt2BlogEditorialOptionsResponse } from '../types/editorial.types'

export async function getPrompt2BlogEditorialOptions(): Promise<Prompt2BlogEditorialOptionsResponse> {
  const response = await apiFetch(`${FEATURE_PREFIX}/editorial-options`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Prompt2Blog editorial options')
  }

  return response.json()
}
