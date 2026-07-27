import { describe, expect, it } from 'vitest'
import type { Prompt2BlogInputOptionsResponse } from '../api'
import { reviewEasySetupJson } from './easy-setup-import'

function createInputOptions(): Prompt2BlogInputOptionsResponse {
  return {
    article_types: [
      { id: 7, name: 'Destination Guide', definition: 'Overview of a place.' },
      { id: 11, name: "Beginner's Guide", definition: 'Assumes zero knowledge.' },
      { id: 19, name: 'Itinerary Article', definition: 'Day-by-day plan.' },
    ],
    tones: [
      { id: 'practical', label: 'Practical' },
      { id: 'inspirational', label: 'Inspirational' },
    ],
    lengths: [
      { id: 'short', label: 'Short' },
      { id: 'medium', label: 'Medium' },
    ],
    brand_voices: [{ id: 'questurian-default', label: 'Questurian Default' }],
    defaults: {
      tone_id: 'practical',
      length_id: 'medium',
      brand_voice_id: 'questurian-default',
    },
  }
}

function createApprovedJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    title: 'A Weekend in Lisbon',
    location: 'Lisbon, Portugal',
    article_type: 'Destination Guide',
    article_goal: 'Help a reader plan two full days without wasted transit.',
    target_reader: 'A first-time visitor with 48 hours and a mid-range budget.',
    destination_context: 'Lisbon, Portugal, on the Tagus estuary.',
    angle: 'Neighbourhood-first planning beats landmark ticking.',
    call_to_action: 'Book the Alfama viewpoint slot before arriving.',
    tone_id: 'practical',
    length_id: 'medium',
    brand_voice_id: 'questurian-default',
    creativity_level: 'medium',
    primary_keyword: 'weekend in lisbon',
    secondary_keywords: ['lisbon itinerary', '48 hours in lisbon'],
    must_include: ['Tram 28 crowding', 'Airport transfer costs'],
    negative_instructions: ['No unsourced price claims'],
    enable_editorial_augmentation: false,
    source_material: ['RESEARCH NEEDED: current Carris fare'],
    model_name: 'gemini-2.5-flash-lite',
    writing_model: 'gemini-3.1-pro-preview',
    ...overrides,
  })
}

describe('reviewEasySetupJson', () => {
  it('maps an exact brief onto the composer fields', () => {
    const review = reviewEasySetupJson(createApprovedJson(), createInputOptions())

    expect(review.issues).toEqual([])
    expect(review.corrections).toEqual([])
    expect(review.patch).toEqual({
      easySetupTitle: 'A Weekend in Lisbon',
      easySetupLocation: 'Lisbon, Portugal',
      articleTypeId: 7,
      articleGoal: 'Help a reader plan two full days without wasted transit.',
      targetReader: 'A first-time visitor with 48 hours and a mid-range budget.',
      destinationContext: 'Lisbon, Portugal, on the Tagus estuary.',
      angle: 'Neighbourhood-first planning beats landmark ticking.',
      callToAction: 'Book the Alfama viewpoint slot before arriving.',
      toneId: 'practical',
      lengthId: 'medium',
      brandVoiceId: 'questurian-default',
      creativityLevel: 'medium',
      primaryKeyword: 'weekend in lisbon',
      secondaryKeywords: 'lisbon itinerary, 48 hours in lisbon',
      mustInclude: 'Tram 28 crowding\nAirport transfer costs',
      negativeInstructions: 'No unsourced price claims',
      enableEditorialAugmentation: false,
      modelName: 'gemini-2.5-flash-lite',
      writingModel: 'gemini-3.1-pro-preview',
      blobs: [{ id: 1, content: 'RESEARCH NEEDED: current Carris fare' }],
    })
    expect(review.rows).toContainEqual({ field: 'Article Type', value: 'Destination Guide (id 7)' })
  })

  it('reads the object out of a fenced, chatty reply', () => {
    const raw = [
      'Sure — here is the brief:',
      '```json',
      createApprovedJson(),
      '```',
      'Let me know if you want changes.',
    ].join('\n')

    const review = reviewEasySetupJson(raw, createInputOptions())

    expect(review.issues).toEqual([])
    expect(review.patch?.articleTypeId).toBe(7)
  })

  it('accepts a smart-quoted article type and reports the correction', () => {
    const review = reviewEasySetupJson(
      createApprovedJson({ article_type: '  Beginner’s Guide ' }),
      createInputOptions(),
    )

    expect(review.issues).toEqual([])
    expect(review.patch?.articleTypeId).toBe(11)
    expect(review.corrections).toContainEqual({
      field: 'article_type',
      message: 'Matched "Beginner’s Guide" to "Beginner\'s Guide".',
    })
  })

  it('accepts an option label in place of its id and reports the correction', () => {
    const review = reviewEasySetupJson(
      createApprovedJson({ tone_id: 'Inspirational' }),
      createInputOptions(),
    )

    expect(review.issues).toEqual([])
    expect(review.patch?.toneId).toBe('inspirational')
    expect(review.corrections).toContainEqual({
      field: 'tone_id',
      message: 'Matched "Inspirational" to "inspirational".',
    })
  })

  it('rejects a near-miss value and names the closest allowed one', () => {
    const review = reviewEasySetupJson(
      createApprovedJson({ article_type: 'Destination Guides' }),
      createInputOptions(),
    )

    expect(review.patch).toBeNull()
    expect(review.issues).toContainEqual({
      field: 'article_type',
      message: '"Destination Guides" is not one of the allowed values. Closest match: "Destination Guide".',
    })
  })

  it('rejects a value that is not in the catalog at all', () => {
    const review = reviewEasySetupJson(
      createApprovedJson({ article_type: 'Photo Essay' }),
      createInputOptions(),
    )

    expect(review.patch).toBeNull()
    expect(review.issues).toContainEqual({
      field: 'article_type',
      message: '"Photo Essay" is not one of the allowed values.',
    })
  })

  it('rejects a writer model that is not currently offered', () => {
    const review = reviewEasySetupJson(
      createApprovedJson({ writing_model: 'claude-opus-4-8' }),
      createInputOptions(),
    )

    expect(review.patch).toBeNull()
    expect(review.issues.some(issue => issue.field === 'writing_model')).toBe(true)
  })

  it('reports missing keys, wrong types, and renamed keys together', () => {
    const parsed = JSON.parse(createApprovedJson()) as Record<string, unknown>
    delete parsed.call_to_action
    parsed.cta = 'Book early.'
    parsed.must_include = 'Tram 28 crowding'
    parsed.enable_editorial_augmentation = 'false'

    const review = reviewEasySetupJson(JSON.stringify(parsed), createInputOptions())

    expect(review.patch).toBeNull()
    expect(review.issues).toContainEqual({
      field: 'call_to_action',
      message: 'Missing from the pasted JSON.',
    })
    expect(review.issues).toContainEqual({
      field: 'must_include',
      message: 'Must be an array of strings, received a string.',
    })
    expect(review.issues).toContainEqual({
      field: 'enable_editorial_augmentation',
      message: 'Must be true or false, received a string.',
    })
    expect(review.issues).toContainEqual({
      field: 'cta',
      message: 'Unexpected key. Did you mean "call_to_action"?',
    })
  })

  it('accepts camelCase keys and records where each value came from', () => {
    const parsed = JSON.parse(createApprovedJson()) as Record<string, unknown>
    parsed.callToAction = parsed.call_to_action
    delete parsed.call_to_action
    parsed.ArticleType = parsed.article_type
    delete parsed.article_type

    const review = reviewEasySetupJson(JSON.stringify(parsed), createInputOptions())

    expect(review.issues).toEqual([])
    expect(review.patch?.callToAction).toBe('Book the Alfama viewpoint slot before arriving.')
    expect(review.patch?.articleTypeId).toBe(7)
    expect(review.corrections).toContainEqual({
      field: 'call_to_action',
      message: 'Read from "callToAction".',
    })
  })

  it('rejects a field supplied twice under different spellings', () => {
    const parsed = JSON.parse(createApprovedJson()) as Record<string, unknown>
    parsed.callToAction = 'Book something else.'

    const review = reviewEasySetupJson(JSON.stringify(parsed), createInputOptions())

    expect(review.patch).toBeNull()
    expect(review.issues).toContainEqual({
      field: 'call_to_action',
      message: 'Provided twice, as "call_to_action" and "callToAction". Keep one.',
    })
  })

  it('drops duplicate array entries and says so', () => {
    const review = reviewEasySetupJson(
      createApprovedJson({
        secondary_keywords: ['lisbon itinerary', 'Lisbon Itinerary ', '48 hours in lisbon'],
      }),
      createInputOptions(),
    )

    expect(review.issues).toEqual([])
    expect(review.patch?.secondaryKeywords).toBe('lisbon itinerary, 48 hours in lisbon')
    expect(review.corrections).toContainEqual({
      field: 'secondary_keywords',
      message: 'Removed 1 duplicate entry.',
    })
  })

  it('turns each source material string into its own raw blob', () => {
    const review = reviewEasySetupJson(
      createApprovedJson({ source_material: ['First note', 'Second note'] }),
      createInputOptions(),
    )

    expect(review.patch?.blobs).toEqual([
      { id: 1, content: 'First note' },
      { id: 2, content: 'Second note' },
    ])
  })

  it('keeps one empty blob when no source material was returned', () => {
    const review = reviewEasySetupJson(
      createApprovedJson({ source_material: [] }),
      createInputOptions(),
    )

    expect(review.patch?.blobs).toEqual([{ id: 1, content: '' }])
  })

  it('refuses malformed input instead of applying half a brief', () => {
    const truncated = reviewEasySetupJson('{"title": "A Weekend in Lisbon"', createInputOptions())
    expect(truncated.patch).toBeNull()
    expect(truncated.issues[0].field).toBe('json')

    const prose = reviewEasySetupJson('I could not produce JSON.', createInputOptions())
    expect(prose.patch).toBeNull()
    expect(prose.issues).toContainEqual({
      field: 'json',
      message: 'No JSON object found. Paste the full { … } object.',
    })

    const broken = reviewEasySetupJson('{ "title": "Lisbon", }', createInputOptions())
    expect(broken.patch).toBeNull()
    expect(broken.issues[0].message).toContain('Not valid JSON')
  })

  it('will not check anything before the option catalogs load', () => {
    const review = reviewEasySetupJson(createApprovedJson(), null)

    expect(review.patch).toBeNull()
    expect(review.issues[0].field).toBe('options')
  })
})
