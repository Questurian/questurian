import { describe, expect, it } from 'vitest'
import type { Prompt2BlogRunRequest } from '../api'
import { validatePipelinePayload } from './validate-pipeline-payload'

function createPayload(overrides: Partial<Prompt2BlogRunRequest> = {}): Prompt2BlogRunRequest {
  return {
    article_type_id: 7,
    source_material: ['Source material'],
    article_goal: 'Help readers plan a trip.',
    target_reader: 'First-time visitors',
    destination_context: 'Lisbon, Portugal',
    model_name: 'gemini-2.5-flash-lite',
    tone_id: 'balanced',
    length_id: 'standard',
    secondary_keywords: [],
    must_include: [],
    prompt_enhance: true,
    creativity_level: 'medium',
    negative_instructions: [],
    include_debug: true,
    enable_editorial_augmentation: true,
    ...overrides,
  }
}

describe('validatePipelinePayload', () => {
  it('accepts a complete pipeline payload', () => {
    expect(validatePipelinePayload(createPayload())).toBeNull()
  })

  it.each([
    [null, 'Article type is required.'],
    [{ article_type_id: 0 }, 'Article type is required.'],
    [{ source_material: [] }, 'At least one source material entry is required.'],
    [{ article_goal: ' ' }, 'Article goal, target reader, and destination context are required.'],
    [{ tone_id: '' }, 'Tone and length are required.'],
  ])('returns the first actionable validation error', (overrides, expected) => {
    expect(validatePipelinePayload(overrides === null ? null : createPayload(overrides))).toBe(expected)
  })
})
