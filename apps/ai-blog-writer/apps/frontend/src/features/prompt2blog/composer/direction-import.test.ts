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
      source_requirements: []
    },
    {
      id: 'comparison',
      label: 'Comparison',
      description: 'Approved co-subjects.',
      order: 12,
      source_requirements: []
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
  return {
    option_id: optionId,
    direction: `Assess Lima's current long-stay value through editorial take ${index}.`,
    form_id: 'analysis',
    topic_module_ids: ['cost-affordability', 'long-stay-remote-work'],
    audience: {
      primary_reader: 'Prospective expats and remote workers',
      tags: ['remote-worker-relocator', 'budget-focused']
    },
    core_reader_question: `Does Lima still deliver value under scenario ${index}?`,
    reader_outcome: `Judge Lima's tradeoffs using scenario ${index}.`,
    primary_subject: 'Lima',
    scope: {
      mode: 'single_subject',
      references: [
        { name: 'Lima', role: 'primary_subject' },
        { name: 'Medellín', role: 'context_only' },
        { name: 'Buenos Aires', role: 'context_only' }
      ]
    },
    requirements: [
      {
        requirement_id: 'r1',
        question: `What current evidence settles scenario ${index}?`
      }
    ],
    exclusions: [
      'Do not organize the article as a city-versus-city comparison.'
    ],
    rationale: `This option tests a distinct value proposition ${index}.`
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
})
