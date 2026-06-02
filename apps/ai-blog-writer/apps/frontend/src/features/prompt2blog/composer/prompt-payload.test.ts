import { describe, expect, it } from 'vitest'
import { DEFAULT_PROMPT2BLOG_MODEL } from '../constants/prompt2blog.constants'
import type { P2BFormState } from './composer.types'
import { buildPrompt2BlogPayload } from './prompt-payload'

function createState(overrides: Partial<P2BFormState> = {}): P2BFormState {
  return {
    articleTypeId: 7,
    articleGoal: 'Help readers plan a trip.',
    targetReader: 'First-time visitors',
    destinationContext: 'Lisbon, Portugal',
    modelName: DEFAULT_PROMPT2BLOG_MODEL,
    toneId: 'balanced',
    lengthId: 'standard',
    brandVoiceId: 'questurian',
    primaryKeyword: '',
    secondaryKeywords: '',
    mustInclude: '',
    audienceProfile: '',
    creativityLevel: 'medium',
    negativeInstructions: '',
    promptEnhance: true,
    enableEditorialAugmentation: true,
    blobs: [{ id: 1, content: 'Source material' }],
    ...overrides,
  }
}

describe('buildPrompt2BlogPayload', () => {
  it('returns null when article type is not selected', () => {
    expect(buildPrompt2BlogPayload(createState({ articleTypeId: null }))).toBeNull()
  })

  it('returns a request with the selected article type id', () => {
    expect(buildPrompt2BlogPayload(createState())).toEqual(
      expect.objectContaining({
        article_type_id: 7,
        source_material: ['Source material'],
      }),
    )
  })
})
