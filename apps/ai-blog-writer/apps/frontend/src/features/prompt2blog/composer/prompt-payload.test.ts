import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROMPT2BLOG_MODEL,
  DEFAULT_PROMPT2BLOG_WRITER_MODEL,
} from '../constants/prompt2blog.constants'
import type { P2BFormState } from './composer.types'
import { buildPrompt2BlogPayload } from './prompt-payload'

function createState(overrides: Partial<P2BFormState> = {}): P2BFormState {
  return {
    articleTypeId: 7,
    articleGoal: 'Help readers plan a trip.',
    targetReader: 'First-time visitors',
    destinationContext: 'Lisbon, Portugal',
    angle: '',
    callToAction: '',
    modelName: DEFAULT_PROMPT2BLOG_MODEL,
    writingModel: DEFAULT_PROMPT2BLOG_WRITER_MODEL,
    toneId: 'balanced',
    lengthId: 'standard',
    brandVoiceId: 'questurian',
    primaryKeyword: '',
    secondaryKeywords: '',
    mustInclude: '',
    creativityLevel: 'medium',
    negativeInstructions: '',
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

  it('sends the editorial angle and call to action when supplied', () => {
    const payload = buildPrompt2BlogPayload(
      createState({ angle: 'Peru is the better first stop', callToAction: 'Compare fares' }),
    )

    expect(payload).toEqual(
      expect.objectContaining({
        angle: 'Peru is the better first stop',
        call_to_action: 'Compare fares',
      }),
    )
  })

  it('omits the angle and call to action when left blank', () => {
    // call_to_action is gated by the backend quality check, so an empty string
    // would register as a constraint the article has to satisfy.
    const payload = buildPrompt2BlogPayload(createState())

    expect(payload?.angle).toBeUndefined()
    expect(payload?.call_to_action).toBeUndefined()
  })

  it('omits duplicate audience steering and disables generic prompt enhancement', () => {
    const payload = buildPrompt2BlogPayload(createState())

    expect(payload).not.toHaveProperty('audience_profile')
    expect(payload?.prompt_enhance).toBe(false)
  })
})
