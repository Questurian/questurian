import { describe, expect, it } from 'vitest'
import type { Prompt2BlogEditorialOptionsResponse } from '../api'
import type { Prompt2BlogInputOption } from '../api'
import {
  buildDirectionPrompt,
  researchQuestionCeilingForLength,
  researchQuestionsForLength
} from './direction-prompt'

const catalog = {
  schema_version: 3,
  forms: [
    {
      id: 'analysis',
      label: 'Analysis',
      description: 'Interprets evidence to answer a focused question.',
      order: 2,
      source_requirements: [],
      use_when: 'Use when the fixture needs a form.',
      do_not_use_when: 'Do not use when another form fits better.'
    },
    {
      id: 'comparison',
      label: 'Comparison',
      description: 'Compares approved co-subjects against consistent criteria.',
      order: 12,
      source_requirements: [],
      use_when: 'Use when the fixture needs a form.',
      do_not_use_when: 'Do not use when another form fits better.'
    }
  ],
  topic_modules: [
    {
      id: 'cost-affordability',
      label: 'Cost and affordability',
      description: 'Constrains cost evidence and comparisons.',
      order: 1
    }
  ],
  audience_tags: [
    {
      id: 'budget-focused',
      label: 'Budget-focused',
      description: 'Prioritizes costs and value.'
    }
  ],
  scope_modes: [
    {
      id: 'single_subject',
      label: 'Single subject',
      description: 'Keeps one subject primary.'
    }
  ],
  reference_roles: [
    {
      id: 'primary_subject',
      label: 'Primary subject',
      description: 'The controlling subject.'
    },
    {
      id: 'context_only',
      label: 'Context only',
      description: 'Cannot organize the article.'
    }
  ]
} satisfies Prompt2BlogEditorialOptionsResponse

const longLength = {
  id: 'long',
  label: 'Long',
  target_word_count: 1400
} satisfies Prompt2BlogInputOption

describe('buildDirectionPrompt', () => {
  it('asks for exactly three fixed editorial options from the v3 catalog', () => {
    const prompt = buildDirectionPrompt(
      "Is Lima still South America's bargain expat capital?",
      'Lima, Peru',
      catalog,
      longLength
    )

    expect(prompt).toContain(
      `Original title: "Is Lima still South America's bargain expat capital?"`
    )
    expect(prompt).toContain('Location: "Lima, Peru"')
    expect(prompt).toContain(
      'exactly three materially different editorial options'
    )
    expect(prompt.match(/"direction-[123]"/g)).toEqual([
      '"direction-1"',
      '"direction-2"',
      '"direction-3"'
    ])
    expect(prompt).toContain('- analysis (Analysis) — Interprets evidence')
    expect(prompt).toContain('USE WHEN: Use when the fixture needs a form.')
    expect(prompt).toContain(
      'DO NOT USE WHEN: Do not use when another form fits better.'
    )
    expect(prompt).toContain('- cost-affordability (Cost and affordability)')
    expect(prompt).toContain('- budget-focused (Budget-focused)')
    expect(prompt).toContain('- single_subject (Single subject)')
    expect(prompt).toContain('- context_only (Context only)')
  })

  it('keeps direction generation separate from research and legacy controls', () => {
    const prompt = buildDirectionPrompt(
      'A weekend in Lisbon',
      'Lisbon, Portugal',
      catalog,
      longLength
    )

    expect(prompt).toContain(
      'Do not browse, research facts, or write the article'
    )
    expect(prompt).toContain('required research questions')
    expect(prompt).toContain(
      'Context-only references cannot become co-subjects'
    )
    expect(prompt).not.toContain('tone_id')
    expect(prompt).not.toContain('article_type')
    expect(prompt).not.toContain('source_material')
  })

  it('quotes untrusted title and location text as JSON strings', () => {
    const prompt = buildDirectionPrompt(
      'The "quiet" side of Lima',
      'Lima "Centro"',
      catalog,
      longLength
    )

    expect(prompt).toContain('Original title: "The \\"quiet\\" side of Lima"')
    expect(prompt).toContain('Location: "Lima \\"Centro\\""')
  })

  it('sizes the research question floor to the commissioned length', () => {
    // One question produced one answer and a 388 word article against a 1400
    // word target. The floor is arithmetic, not taste: roughly one section per
    // question, roughly 350 words per section.
    expect(researchQuestionsForLength(1400)).toBe(4)
    expect(researchQuestionsForLength(700)).toBe(3)
    expect(researchQuestionsForLength(4000)).toBe(8)
    // A missing length must not silently mean "one question is fine".
    expect(researchQuestionsForLength(0)).toBe(3)
  })

  it('caps the research questions at what the length can absorb', () => {
    /*
     * The floor alone only pushed one way. The Lima restaurant run came back
     * with six questions against a 1400 word target -- about 2100 words of
     * material for a 1540 word ceiling -- and the article was over length
     * before a word was written.
     */
    expect(researchQuestionCeilingForLength(1400)).toBe(4)
    expect(researchQuestionCeilingForLength(4000)).toBe(12)
    // The ceiling can never sit below the floor at any length.
    expect(researchQuestionCeilingForLength(700)).toBe(
      researchQuestionsForLength(700)
    )
    // No length chosen means no measured band and so no ceiling.
    expect(researchQuestionCeilingForLength(0)).toBe(0)

    const prompt = buildDirectionPrompt(
      'Where to eat in Lima right now',
      'Lima, Peru',
      catalog,
      longLength
    )
    expect(prompt).toContain('cannot be written to length')
    /*
     * The ceiling has to appear in the output contract and the schema
     * examples, not only in the rules prose. This prompt already lost that
     * argument once: see 'refuses to teach one question by example' below,
     * where the rule said "at least one", the example said "one", and the
     * example won.
     */
    const uncapped = prompt.match(/at least 4(?! and at most)/g) ?? []
    expect(uncapped).toEqual([])
    expect(prompt).toContain(
      'needs at least 4 and at most 4 requirements, numbered from r1'
    )
    expect(prompt).toContain(
      '"requirements": ["at least 4 and at most 4, same shape as above"]'
    )
  })

  it('tells the chooser the working title is a promise it must keep', () => {
    const prompt = buildDirectionPrompt(
      'Where to eat in Lima right now',
      'Lima, Peru',
      catalog,
      longLength
    )

    expect(prompt).toContain('THE TITLE IS A PROMISE')
    expect(prompt).toContain('A title containing "right now" is not automatically news.')
    expect(prompt).toContain(
      'needs at least 4 and at most 4 required research questions'
    )
    expect(prompt).toContain('"requirement_id": "r4"')
  })

  it('refuses to teach one question by example', () => {
    // The old template showed exactly one requirement in all three options.
    // The rule said "at least one"; the example said "one", and the example won.
    const prompt = buildDirectionPrompt('A weekend in Lisbon', 'Lisbon, Portugal', catalog, longLength)
    const sampleRequirementIds = prompt.match(/"requirement_id": "r\d+"/g) ?? []

    expect(sampleRequirementIds.length).toBeGreaterThan(1)
  })

  it('asks for a subject that can be named rather than summarized', () => {
    const prompt = buildDirectionPrompt('A weekend in Lisbon', 'Lisbon, Portugal', catalog, longLength)

    expect(prompt).toContain('make it a nameable thing')
    expect(prompt).toContain('is not a subject, it is a summary')
  })

  it('still builds a usable prompt when no length has been chosen', () => {
    const prompt = buildDirectionPrompt('A weekend in Lisbon', 'Lisbon, Portugal', catalog, null)

    // No length chosen means no measured band, so there is no ceiling to state.
    expect(prompt).toContain('needs at least 3 required research questions')
    expect(prompt).not.toContain('at most')
  })

  it('tells the direction model what day it is', () => {
    // It had no date and could not browse, so a list scheduled for December
    // read exactly like a list already out.
    const prompt = buildDirectionPrompt(
      'Where to eat in Lima right now',
      'Lima, Peru',
      catalog,
      longLength,
      '2026-08-27'
    )

    expect(prompt).toContain("Today's date: 2026-08-27")
    expect(prompt).toContain('today is 2026-08-27')
  })

  it('makes every option declare what it is assuming it cannot check', () => {
    const prompt = buildDirectionPrompt(
      'Where to eat in Lima right now',
      'Lima, Peru',
      catalog,
      longLength,
      '2026-08-27'
    )

    expect(prompt).toContain('PREMISE BEFORE QUESTIONS')
    expect(prompt).toContain('"assumption_id": "a1"')
    expect(prompt).toContain('numbered from a1 upward')
    expect(prompt).toContain('"assumption_ids"')
  })

  it('forbids the question chain that turns one wrong premise into no article', () => {
    const prompt = buildDirectionPrompt(
      'Where to eat in Lima right now',
      'Lima, Peru',
      catalog,
      longLength,
      '2026-08-27'
    )

    expect(prompt).toContain(
      "No question may depend on another question's answer."
    )
  })

  it('never illustrates a rule with an example that breaks it', () => {
    // The "name things" example was itself two questions joined by "and",
    // against the compound rule three lines above it.
    const prompt = buildDirectionPrompt(
      'A weekend in Lisbon',
      'Lisbon, Portugal',
      catalog,
      longLength
    )

    expect(prompt).not.toContain(
      'which restaurants opened in Barranco in 2026, and what do they charge'
    )
  })

  it('carries a refutation back so the next round cannot re-propose it', () => {
    // Without this the operator returns to this step with nothing but their
    // own memory, and the model still cannot browse.
    const prompt = buildDirectionPrompt(
      'Where to eat in Lima right now',
      'Lima, Peru',
      catalog,
      longLength,
      '2026-08-27',
      [
        {
          statement:
            "The 2026 Latin America's 50 Best Restaurants list has been published.",
          basis: 'The organizers schedule the reveal for 1 December 2026.'
        }
      ]
    )

    expect(prompt).toContain('ALREADY ESTABLISHED AS FALSE')
    expect(prompt).toContain('1 December 2026')
    expect(prompt).toContain('do not restate one in softer words')
  })

  it('says nothing about refutations when there are none', () => {
    const prompt = buildDirectionPrompt(
      'A weekend in Lisbon',
      'Lisbon, Portugal',
      catalog,
      longLength,
      '2026-08-27'
    )

    expect(prompt).not.toContain('ALREADY ESTABLISHED AS FALSE')
  })

  it('never sends the word count to the operator\'s own chatbot', () => {
    // The count is what the chatbot needs; the length is the app's business.
    // It appeared twice and did nothing the derived question count did not.
    const prompt = buildDirectionPrompt(
      'Where to eat in Lima right now',
      'Lima, Peru',
      catalog,
      longLength
    )

    expect(prompt).not.toContain('1400')
    expect(prompt).not.toContain('Target length')
    expect(prompt.toLowerCase()).not.toContain('word count')
  })
})
