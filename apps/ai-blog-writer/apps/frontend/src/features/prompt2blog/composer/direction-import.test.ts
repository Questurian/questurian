import { describe, expect, it } from 'vitest'
import type {
  Prompt2BlogDirectionResponse,
  Prompt2BlogEditorialOptionsResponse
} from '../api'
import { reviewDirectionResponseJson } from './direction-import'

const catalog = {
  schema_version: 3,
  forms: [
    {
      id: 'analysis',
      label: 'Analysis',
      description: 'Focused interpretation.',
      order: 2,
      source_requirements: [],
      use_when: 'Use when the fixture needs a form.',
      do_not_use_when: 'Do not use when another form fits better.'
    },
    {
      id: 'comparison',
      label: 'Comparison',
      description: 'Approved co-subjects.',
      order: 12,
      source_requirements: [],
      use_when: 'Use when the fixture needs a form.',
      do_not_use_when: 'Do not use when another form fits better.'
    }
  ],
  topic_modules: [
    {
      id: 'cost-affordability',
      label: 'Cost',
      description: 'Cost evidence.',
      order: 1
    },
    {
      id: 'accommodation-neighborhoods',
      label: 'Accommodation',
      description: 'Housing evidence.',
      order: 2
    },
    {
      id: 'transportation',
      label: 'Transportation',
      description: 'Transport evidence.',
      order: 4
    },
    {
      id: 'safety',
      label: 'Safety',
      description: 'Safety evidence.',
      order: 5
    },
    {
      id: 'long-stay-remote-work',
      label: 'Long stay',
      description: 'Long-stay evidence.',
      order: 9
    }
  ],
  audience_tags: [
    {
      id: 'remote-worker-relocator',
      label: 'Remote worker',
      description: 'Long-stay reader.'
    },
    {
      id: 'budget-focused',
      label: 'Budget-focused',
      description: 'Cost-sensitive reader.'
    }
  ],
  scope_modes: [
    {
      id: 'single_subject',
      label: 'Single subject',
      description: 'One subject.'
    },
    {
      id: 'head_to_head',
      label: 'Head to head',
      description: 'Two or more co-subjects.'
    },
    {
      id: 'ranked_set',
      label: 'Ranked set',
      description: 'Ranked co-subjects.'
    }
  ],
  reference_roles: [
    {
      id: 'primary_subject',
      label: 'Primary',
      description: 'Controlling subject.'
    },
    {
      id: 'context_only',
      label: 'Context only',
      description: 'Context, never structure.'
    },
    {
      id: 'comparator',
      label: 'Comparator',
      description: 'Approved co-subject.'
    }
  ]
} satisfies Prompt2BlogEditorialOptionsResponse

const expected = {
  originalTitle: "Is Lima still South America's bargain expat capital?",
  location: 'Lima, Peru'
}

function option(
  optionId: 'direction-1' | 'direction-2' | 'direction-3',
  index: number
) {
  const directions = [
    "Test Lima's affordability claim against current housing, food, and transport costs.",
    'Explain which neighborhoods make long stays workable for remote professionals.',
    'Assess the practical tradeoffs of choosing Lima for a year abroad.'
  ] as const
  const questions = [
    'What does a realistic monthly budget buy in Lima now?',
    'Where can remote workers build a convenient daily routine?',
    'Which benefits and frictions matter most over a full year?'
  ] as const
  const outcomes = [
    'Build a current budget and decide whether Lima remains affordable.',
    'Shortlist neighborhoods using work, housing, and mobility needs.',
    'Weigh long-term advantages against the costs of living in Lima.'
  ] as const
  const requirements = [
    'What do current housing, food, and transportation costs show?',
    'Which neighborhoods best combine housing, workspaces, and transport?',
    'What evidence captures the strongest long-stay benefits and frictions?'
  ] as const
  const rationales = [
    'Grounds the bargain claim in a concrete, current monthly budget.',
    'Turns a broad relocation question into a practical neighborhood decision.',
    'Gives readers a balanced decision framework for a year-long move.'
  ] as const
  const position = index - 1

  return {
    option_id: optionId,
    direction: directions[position],
    form_id: 'analysis',
    topic_module_ids: ['cost-affordability', 'long-stay-remote-work'],
    audience: {
      primary_reader: 'Prospective expats and remote workers',
      tags: ['remote-worker-relocator', 'budget-focused']
    },
    core_reader_question: questions[position],
    reader_outcome: outcomes[position],
    primary_subject: 'Lima',
    scope: {
      mode: 'single_subject',
      references: [
        { name: 'Lima', role: 'primary_subject' },
        { name: 'Medellín', role: 'context_only' },
        { name: 'Buenos Aires', role: 'context_only' }
      ]
    },
    premise: [
      {
        assumption_id: 'a1',
        statement: 'Lima still markets itself as an affordable long-stay city.'
      }
    ],
    requirements: [
      {
        requirement_id: 'r1',
        question: requirements[position],
        assumption_ids: ['a1']
      }
    ],
    exclusions: [
      'Do not organize the article as a city-versus-city comparison.'
    ],
    rationale: rationales[position]
  }
}

function response(): Prompt2BlogDirectionResponse {
  return {
    schema_version: 3,
    original_title: expected.originalTitle,
    location: expected.location,
    options: [
      option('direction-1', 1),
      option('direction-2', 2),
      option('direction-3', 3)
    ]
  } as Prompt2BlogDirectionResponse
}

function review(value: unknown) {
  return reviewDirectionResponseJson(JSON.stringify(value), expected, catalog)
}

describe('reviewDirectionResponseJson', () => {
  it('accepts exactly three Lima-centered options with context-only benchmarks', () => {
    const result = review(response())

    expect(result.issues).toEqual([])
    expect(result.response).toEqual(response())
  })

  it('refuses an option that declares no premise at all', () => {
    const value = response()
    value.options[0].premise = []

    expect(review(value).issues).toContainEqual({
      path: 'options[0].premise',
      message:
        'Must state at least 1 premise. An option that assumes nothing it ' +
        'cannot check has nothing to declare, which is itself worth saying.'
    })
  })

  it('refuses a question that depends on a premise nobody declared', () => {
    const value = response()
    value.options[0].requirements[0].assumption_ids = ['a7']

    expect(review(value).issues).toContainEqual({
      path: 'options[0].requirements[0].assumption_ids[0]',
      message: 'Unknown assumption ID.'
    })
  })

  it('refuses premise IDs outside the stable a1, a2 sequence', () => {
    const value = response()
    value.options[0].premise = [
      { assumption_id: 'assumption-one', statement: 'Something checkable.' }
    ]
    value.options[0].requirements[0].assumption_ids = []

    expect(review(value).issues).toContainEqual({
      path: 'options[0].premise[0].assumption_id',
      message: 'Must use the stable a1, a2, … format.'
    })
  })

  it('requires a bare strict JSON object with no extra keys', () => {
    expect(
      reviewDirectionResponseJson(
        `\`\`\`json\n${JSON.stringify(response())}\n\`\`\``,
        expected,
        catalog
      ).issues[0].path
    ).toBe('json')

    const payload = response() as Prompt2BlogDirectionResponse & {
      note: string
    }
    payload.note = 'Here you go'
    expect(review(payload).issues).toContainEqual({
      path: 'note',
      message: 'Unexpected key.'
    })
  })

  it('requires the response to echo the exact app-owned title and location', () => {
    const payload = response()
    payload.original_title = 'A different article'
    payload.location = 'Lima'

    const result = review(payload)

    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['original_title', 'location'])
    )
    expect(result.response).toBeNull()
  })

  it('requires exactly three fixed option IDs in order', () => {
    const tooFew = response() as unknown as { options: unknown[] }
    tooFew.options.pop()
    expect(review(tooFew).issues).toContainEqual({
      path: 'options',
      message: 'Must contain exactly 3 options.'
    })

    const reordered = response()
    ;[reordered.options[0], reordered.options[1]] = [
      reordered.options[1],
      reordered.options[0]
    ]
    expect(
      review(reordered).issues.some(
        (issue) =>
          issue.path === 'options[0].option_id' &&
          issue.message.includes('direction-1')
      )
    ).toBe(true)
  })

  it('rejects unknown catalog IDs and a fifth topic module', () => {
    const unknown = response() as unknown as {
      options: Array<{
        form_id: string
        topic_module_ids: string[]
        audience: { tags: string[] }
        scope: { references: Array<{ role: string }> }
      }>
    }
    unknown.options[0].form_id = 'comparison-article'
    unknown.options[0].topic_module_ids[0] = 'packing'
    unknown.options[0].audience.tags[0] = 'everyone'
    unknown.options[0].scope.references[1].role = 'benchmark'

    expect(review(unknown).issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        'options[0].form_id',
        'options[0].topic_module_ids[0]',
        'options[0].audience.tags[0]',
        'options[0].scope.references[1].role'
      ])
    )

    const tooMany = response()
    tooMany.options[0].topic_module_ids = [
      'cost-affordability',
      'accommodation-neighborhoods',
      'transportation',
      'safety',
      'long-stay-remote-work'
    ]
    expect(review(tooMany).issues).toContainEqual({
      path: 'options[0].topic_module_ids',
      message: 'Must contain at most 4 module IDs.'
    })
  })

  it('rejects comparison drift and inconsistent comparison scope', () => {
    const drifted = response()
    drifted.options[0].scope.references[1].role = 'comparator'
    expect(review(drifted).issues).toContainEqual({
      path: 'options[0].scope',
      message: 'single_subject scope cannot contain comparators.'
    })

    const comparison = response()
    comparison.options[0].form_id = 'comparison'
    expect(review(comparison).issues).toContainEqual({
      path: 'options[0].scope.mode',
      message: 'Comparison form cannot use single_subject scope.'
    })

    const hiddenComparison = response()
    hiddenComparison.options[0].scope.mode = 'head_to_head'
    hiddenComparison.options[0].scope.references[1].role = 'comparator'
    expect(review(hiddenComparison).issues).toContainEqual({
      path: 'options[0].form_id',
      message: 'head_to_head scope requires Comparison form.'
    })
  })

  it('requires one matching primary reference and consistent comparator counts', () => {
    const mismatch = response()
    mismatch.options[0].scope.references[0].name = 'Peru'
    expect(review(mismatch).issues).toContainEqual({
      path: 'options[0].primary_subject',
      message: 'Must exactly match the primary_subject reference name.'
    })

    const ranked = response()
    ranked.options[0].form_id = 'comparison'
    ranked.options[0].scope.mode = 'ranked_set'
    ranked.options[0].scope.references[1].role = 'comparator'
    expect(review(ranked).issues).toContainEqual({
      path: 'options[0].scope',
      message: 'ranked_set scope requires at least 2 comparators.'
    })
  })

  it('rejects duplicate modules, tags, references, requirements, and options', () => {
    const duplicates = response()
    duplicates.options[0].topic_module_ids = [
      'cost-affordability',
      'cost-affordability'
    ]
    duplicates.options[0].audience.tags = ['budget-focused', 'budget-focused']
    duplicates.options[0].scope.references.push({
      name: 'lima',
      role: 'context_only'
    })
    duplicates.options[0].requirements.push({
      requirement_id: 'r1',
      question: 'A duplicated requirement id?'
    })
    duplicates.options[1].direction = duplicates.options[0].direction

    expect(review(duplicates).issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        'options[0].topic_module_ids',
        'options[0].audience.tags',
        'options[0].scope.references',
        'options[0].requirements',
        'options[1].direction'
      ])
    )
  })

  it('rejects options that differ only by trivial suffixes', () => {
    const nearDuplicates = response()
    nearDuplicates.options[1].direction = `${nearDuplicates.options[0].direction} Option 2.`
    nearDuplicates.options[1].core_reader_question = `${nearDuplicates.options[0].core_reader_question} Choice 2?`
    nearDuplicates.options[1].reader_outcome = `${nearDuplicates.options[0].reader_outcome} Version 2.`

    expect(review(nearDuplicates).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'options[1].direction' }),
        expect.objectContaining({ path: 'options[1].core_reader_question' }),
        expect.objectContaining({ path: 'options[1].reader_outcome' })
      ])
    )
  })
})

describe('direction warnings never block an import', () => {
  function reviewWithLength(value: unknown, targetWordCount: number) {
    return reviewDirectionResponseJson(
      JSON.stringify(value),
      { ...expected, targetWordCount },
      catalog
    )
  }

  it('says when a direction asks too few questions for the length', () => {
    // The Lima food run asked one question against a 1400 word target and
    // produced 388 words. Every option in this fixture carries one requirement.
    const result = reviewWithLength(response(), 1400)

    expect(result.issues).toEqual([])
    expect(result.response).not.toBeNull()
    const tooFew = result.warnings.filter(warning =>
      warning.message.includes('Asks 1 question')
    )
    expect(tooFew).toHaveLength(3)
    expect(tooFew[0].message).toContain('about 1400 words')
    // The operator reads the words on the card, never the JSON path.
    expect(tooFew[0].label).toBe('Direction 1')
    expect(result.warnings.every(warning => !('path' in warning))).toBe(true)
  })

  it('stays quiet when the question count fits the length', () => {
    const value = response()
    value.options.forEach(current => {
      current.requirements = [
        { requirement_id: 'r1', question: 'What does a month of rent cost now?' },
        { requirement_id: 'r2', question: 'Which neighborhoods have coworking desks?' },
        { requirement_id: 'r3', question: 'What does a daily commute cost?' }
      ]
    })

    expect(reviewWithLength(value, 700).warnings).toEqual([])
  })

  it('says when a direction asks too many questions for the length', () => {
    /*
     * The Lima restaurant run: six requirements against a 1400 word target,
     * whose measured ceiling is 1540. Six questions are worth about 2100
     * words. It was over length before a word was written, and nothing said
     * so until two repair passes had been spent trying to cut it back.
     */
    const value = response()
    value.options[0].requirements = Array.from({ length: 6 }, (_unused, index) => ({
      requirement_id: `r${index + 1}`,
      question: `What does item ${index + 1} cost a visitor today?`,
      assumption_ids: ['a1']
    }))

    const result = reviewWithLength(value, 1400)

    expect(result.issues).toEqual([])
    expect(result.response).not.toBeNull()
    const tooMany = result.warnings.filter(warning =>
      warning.message.includes('Asks 6 questions')
    )
    expect(tooMany).toHaveLength(1)
    expect(tooMany[0].label).toBe('Direction 1')
    expect(tooMany[0].message).toContain('2100 words of material')
    expect(tooMany[0].message).toContain('1540 word ceiling')
    expect(tooMany[0].message).toContain('about 4 questions')
  })

  it('never fires the too-few and too-many warnings on one direction', () => {
    // Both are derived from the same 350-words-a-question figure, so a length
    // that made both true would be arithmetic telling the operator nothing.
    for (const targetWordCount of [700, 1000, 1400, 2000, 4000]) {
      for (const questionCount of [1, 3, 4, 6, 9, 14]) {
        const value = response()
        value.options[0].requirements = Array.from(
          { length: questionCount },
          (_unused, index) => ({
            requirement_id: `r${index + 1}`,
            question: `What does item ${index + 1} cost a visitor today?`,
            assumption_ids: ['a1']
          })
        )
        const messages = reviewWithLength(value, targetWordCount)
          .warnings.filter(warning => warning.label === 'Direction 1')
          .map(warning => warning.message)

        expect(
          messages.filter(message => /^Asks \d+ questions? for an article/.test(message))
        ).not.toHaveLength(2)
      }
    }
  })

  it('flags a question that asks more than one thing', () => {
    const value = response()
    value.options[0].requirements = [
      {
        requirement_id: 'r1',
        question:
          'How long are waits at immigration, at baggage reclaim, and at the exit?'
      }
    ]

    const warnings = reviewWithLength(value, 700).warnings

    expect(
      warnings.some(warning => warning.message.includes('Asks more than one thing'))
    ).toBe(true)
  })

  it('flags a primary subject that describes an article instead of naming one', () => {
    const value = response()
    value.options[0].primary_subject =
      "The current shift underway in Lima's dining scene"
    value.options[0].scope.references[0].name =
      "The current shift underway in Lima's dining scene"

    const warnings = reviewWithLength(value, 700).warnings

    expect(
      warnings.some(warning => warning.message.includes('describes an article'))
    ).toBe(true)
  })

  it('reads the head noun, not a place name buried in the phrase', () => {
    // "Lima's dining scene" mentions Lima and is still about nothing lookupable.
    const value = response()
    value.options[0].primary_subject = "Lima's dining scene"
    value.options[0].scope.references[0].name = "Lima's dining scene"

    expect(
      reviewWithLength(value, 700).warnings.some(warning =>
        warning.message.includes('describes an article')
      )
    ).toBe(true)
  })

  it('accepts a loose phrasing that still names something researchable', () => {
    const value = response()
    value.options[0].primary_subject = 'The shift at Central'
    value.options[0].scope.references[0].name = 'The shift at Central'

    const warnings = reviewWithLength(value, 700).warnings

    expect(
      warnings.some(warning => warning.message.includes('describes an article'))
    ).toBe(false)
  })

  it('flags a premise that assumes a dated thing already happened', () => {
    // The run that motivated this: five questions about the 2026 Latin
    // America's 50 Best list, revealed 1 December 2026, asked in August.
    const value = response()
    value.options[0].premise = [
      {
        assumption_id: 'a1',
        statement:
          "The 2026 Latin America's 50 Best Restaurants list has been published."
      }
    ]

    const warnings = reviewDirectionResponseJson(
      JSON.stringify(value),
      { ...expected, asOfDate: '2026-08-27' },
      catalog
    ).warnings

    expect(
      warnings.some(warning =>
        warning.message.includes('assumes something dated has already happened')
      )
    ).toBe(true)
  })

  it('leaves a dated premise alone once its year is behind us', () => {
    const value = response()
    value.options[0].premise = [
      {
        assumption_id: 'a1',
        statement:
          "The 2025 Latin America's 50 Best Restaurants list has been published."
      }
    ]

    const warnings = reviewDirectionResponseJson(
      JSON.stringify(value),
      { ...expected, asOfDate: '2026-08-27' },
      catalog
    ).warnings

    expect(
      warnings.some(warning =>
        warning.message.includes('assumes something dated has already happened')
      )
    ).toBe(false)
  })

  it('says so when one premise carries every question in an option', () => {
    const value = response()
    value.options[0].premise = [
      { assumption_id: 'a1', statement: 'The 2026 ranking is out.' }
    ]
    value.options[0].requirements = [
      { requirement_id: 'r1', question: 'Which places were ranked?', assumption_ids: ['a1'] },
      { requirement_id: 'r2', question: 'What do the ranked places charge?', assumption_ids: ['a1'] },
      { requirement_id: 'r3', question: 'How long is the wait at each?', assumption_ids: ['a1'] }
    ]

    const warnings = reviewWithLength(value, 1000).warnings

    expect(
      warnings.some(warning =>
        warning.message.includes('All 3 questions depend on')
      )
    ).toBe(true)
  })

  it('stays quiet when a shaky premise carries only part of an option', () => {
    const value = response()
    value.options[0].premise = [
      { assumption_id: 'a1', statement: 'The 2026 ranking is out.' },
      { assumption_id: 'a2', statement: 'Barranco has published restaurant openings.' }
    ]
    value.options[0].requirements = [
      { requirement_id: 'r1', question: 'Which places were ranked?', assumption_ids: ['a1'] },
      { requirement_id: 'r2', question: 'What opened in Barranco this year?', assumption_ids: ['a2'] },
      { requirement_id: 'r3', question: 'What does a tasting menu cost in Barranco?', assumption_ids: [] }
    ]

    const warnings = reviewWithLength(value, 1000).warnings

    expect(
      warnings.some(warning => warning.message.includes('questions depend on'))
    ).toBe(false)
  })

  it('reports no warnings when no length was set', () => {
    // A missing length must not invent a question-count complaint.
    const warnings = review(response()).warnings

    expect(
      warnings.some(warning => warning.message.includes('Asks 1 question'))
    ).toBe(false)
  })
})
