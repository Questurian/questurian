import { describe, expect, it } from 'vitest'
import type { Prompt2BlogInputOptionsResponse } from '../api'
import { buildEasySetupPrompt } from './easy-setup-prompt'

function createInputOptions(
  overrides: Partial<Prompt2BlogInputOptionsResponse> = {},
): Prompt2BlogInputOptionsResponse {
  return {
    article_types: [
      {
        id: 7,
        name: 'Destination Guide',
        definition: 'Comprehensive overview of a place for trip planning.',
      },
      {
        id: 9,
        name: 'Itinerary Article',
        definition: 'Day-by-day or stop-by-stop planning format.',
      },
    ],
    tones: [
      { id: 'practical', label: 'Practical', description: 'Plain, useful, decision-first.' },
      { id: 'inspirational', label: 'Inspirational', description: 'Evocative and scene-led.' },
    ],
    lengths: [
      { id: 'short', label: 'Short', description: 'Quick read.', target_word_count: 900 },
      { id: 'long', label: 'Long', description: 'Deep coverage.', target_word_count: 2400 },
    ],
    brand_voices: [
      { id: 'questurian-default', label: 'Questurian', description: 'House voice.' },
    ],
    defaults: {
      tone_id: 'practical',
      length_id: 'short',
      brand_voice_id: 'questurian-default',
    },
    ...overrides,
  }
}

describe('buildEasySetupPrompt', () => {
  it('uses the confirmed setup and requests every article field as JSON', () => {
    const prompt = buildEasySetupPrompt(
      'A weekend in Lisbon',
      'Lisbon, Portugal',
      createInputOptions(),
    )

    expect(prompt).toContain('Working title: "A weekend in Lisbon"')
    expect(prompt).toContain('Location: "Lisbon, Portugal"')
    expect(prompt).toContain('One JSON object, nothing before or after it')
    expect(prompt).not.toContain('Prompt2Blog')
    for (const field of [
      'direction',
      'title',
      'location',
      'article_type',
      'article_goal',
      'target_reader',
      'destination_context',
      'angle',
      'call_to_action',
      'tone_id',
      'length_id',
      'brand_voice_id',
      'creativity_level',
      'negative_instructions',
      'enable_editorial_augmentation',
      'primary_keyword',
      'secondary_keywords',
      'must_include',
      'source_material',
    ]) {
      expect(prompt).toContain(`"${field}"`)
    }
    expect(prompt).toContain('RESEARCH NEEDED:')
  })

  it('asks for the direction before anything else and makes it drive the brief', () => {
    const prompt = buildEasySetupPrompt('A weekend in Lisbon', 'Lisbon, Portugal', createInputOptions())

    const schemaStart = prompt.indexOf('{\n  "direction"')
    expect(schemaStart).toBeGreaterThan(-1)
    expect(prompt.indexOf('"title"')).toBeGreaterThan(schemaStart)
    expect(prompt).toContain('1. Decide the direction.')
    expect(prompt).toContain('2. Derive what must be settled.')
    expect(prompt).toContain('3. Research against that list.')
  })

  it('sets a source quality bar instead of accepting bare links', () => {
    const prompt = buildEasySetupPrompt('A weekend in Lisbon', 'Lisbon, Portugal', createInputOptions())

    expect(prompt).toContain('5 to 8 sources')
    expect(prompt).toContain('Primary and official')
    expect(prompt).toContain('SEO listicle farms')
    expect(prompt).toContain('Never silently pick one.')
    expect(prompt).toContain('self-contained research note')
    expect(prompt).toContain('Do not fabricate citations.')
    expect(prompt).toContain('No must_include item may go unsourced.')
  })

  it('lists the loaded option catalogs so every choice comes from a known value', () => {
    const prompt = buildEasySetupPrompt('A weekend in Lisbon', 'Lisbon, Portugal', createInputOptions())

    expect(prompt).toContain('- Destination Guide — Comprehensive overview of a place for trip planning.')
    expect(prompt).toContain('- Itinerary Article — Day-by-day or stop-by-stop planning format.')
    expect(prompt).toContain('- practical (Practical) — Plain, useful, decision-first. [house default]')
    expect(prompt).toContain('- inspirational (Inspirational) — Evocative and scene-led.')
    expect(prompt).toContain('- short (Short) — Quick read. · ~900 words [house default]')
    expect(prompt).toContain('- long (Long) — Deep coverage. · ~2400 words')
    expect(prompt).toContain('- questurian-default (Questurian) — House voice. [house default]')
    expect(prompt).toContain('- low —')
    expect(prompt).toContain('- medium —')
    expect(prompt).toContain('- high —')
    expect(prompt).toContain('Never return a value that is not on the list')
  })

  it('leaves model routing to the run controls', () => {
    const prompt = buildEasySetupPrompt('A weekend in Lisbon', 'Lisbon, Portugal', createInputOptions())

    expect(prompt).not.toContain('"model_name"')
    expect(prompt).not.toContain('"writing_model"')
  })

  it('shortens long catalog blurbs to one readable line', () => {
    const definition = `Line one.\n\n${'x'.repeat(400)}`
    const prompt = buildEasySetupPrompt('A weekend in Lisbon', 'Lisbon, Portugal', createInputOptions({
      article_types: [{ id: 7, name: 'Destination Guide', definition }],
    }))

    const catalogLine = prompt.split('\n').find(line => line.startsWith('- Destination Guide'))
    expect(catalogLine).toBeDefined()
    expect(catalogLine!.length).toBeLessThan(210)
    expect(catalogLine).toContain('Line one. xxx')
    expect(catalogLine).toContain('…')
  })

  it('omits fields whose options are unavailable rather than inviting invented values', () => {
    const prompt = buildEasySetupPrompt('A weekend in Lisbon', 'Lisbon, Portugal', null)

    expect(prompt).not.toContain('"article_type"')
    expect(prompt).not.toContain('"tone_id"')
    expect(prompt).not.toContain('"length_id"')
    expect(prompt).not.toContain('"brand_voice_id"')
    expect(prompt).toContain('"article_goal"')
    expect(prompt).toContain('"creativity_level"')
  })

  it('safely quotes titles and locations containing quotation marks', () => {
    const prompt = buildEasySetupPrompt(
      'The "Quiet" Side of Lisbon',
      'Lisbon "Centro"',
      createInputOptions(),
    )

    expect(prompt).toContain('Working title: "The \\"Quiet\\" Side of Lisbon"')
    expect(prompt).toContain('Location: "Lisbon \\"Centro\\""')
  })
})
