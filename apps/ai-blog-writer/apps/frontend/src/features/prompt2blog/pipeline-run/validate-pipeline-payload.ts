import type { Prompt2BlogRunRequest } from '../api'

export function validatePipelinePayload(payload: Prompt2BlogRunRequest | null): string | null {
  if (!payload) return 'Article type is required.'
  if (!payload.article_type_id) return 'Article type is required.'
  if (!payload.source_material.length) return 'At least one source material entry is required.'
  if (
    !payload.article_goal.trim()
    || !payload.target_reader.trim()
    || !payload.destination_context.trim()
  ) {
    return 'Article goal, target reader, and destination context are required.'
  }
  if (!payload.tone_id || !payload.length_id) return 'Tone and length are required.'
  return null
}
