import { describe, expect, it } from 'vitest'
import limaFixture from '../../../../../../data/fixtures/prompt2blog/lima-scope-drift-v3.json'
import type {
  Prompt2BlogCommission,
  Prompt2BlogCommissionDraft,
  Prompt2BlogDirectionOption,
  Prompt2BlogEditorialOptionsResponse
} from '../api'
import {
  approveCommission,
  createCommissionDraft,
  fingerprintCommission,
  validateCommissionDraft
} from './commission'

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
      description: 'Compared subjects.'
    },
    { id: 'ranked_set', label: 'Ranked set', description: 'Ranked subjects.' }
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

function directionOption(): Prompt2BlogDirectionOption {
  return {
    option_id: 'direction-1',
    direction: 'Assess whether Lima still offers strong long-stay value.',
    form_id: 'analysis',
    topic_module_ids: ['cost-affordability', 'long-stay-remote-work'],
    audience: {
      primary_reader: 'Prospective expats and remote workers',
      tags: ['remote-worker-relocator', 'budget-focused']
    },
    core_reader_question: 'Does Lima still offer compelling long-stay value?',
    reader_outcome: 'Readers can judge Lima using current evidence.',
    primary_subject: 'Lima',
    scope: {
      mode: 'single_subject',
      references: [
        { name: 'Lima', role: 'primary_subject' },
        { name: 'Medellín', role: 'context_only' }
      ]
    },
    requirements: [
      { requirement_id: 'r1', question: 'What are current routine costs?' }
    ],
    exclusions: ['Do not turn context cities into co-subjects.'],
    rationale: 'Tests the title through a Lima-centered value analysis.'
  }
}

describe('Prompt2Blog commission construction', () => {
  it('uses app-owned title and location and excludes option review metadata', () => {
    const option = directionOption()
    const draft = createCommissionDraft(
      "Is Lima still South America's bargain expat capital?",
      'Lima, Peru',
      option
    )

    expect(draft).toEqual({
      schema_version: 3,
      original_title: "Is Lima still South America's bargain expat capital?",
      location: 'Lima, Peru',
      approved_direction: option.direction,
      form_id: option.form_id,
      topic_module_ids: option.topic_module_ids,
      audience: option.audience,
      core_reader_question: option.core_reader_question,
      reader_outcome: option.reader_outcome,
      primary_subject: option.primary_subject,
      scope: option.scope,
      requirements: option.requirements,
      exclusions: option.exclusions,
      call_to_action: null
    })
    expect(draft).not.toHaveProperty('option_id')
    expect(draft).not.toHaveProperty('rationale')

    option.scope.references[0].name = 'Changed later'
    expect(draft.scope.references[0].name).toBe('Lima')
  })

  it('validates edited commissions against catalog and scope rules before approval', async () => {
    const draft = createCommissionDraft(
      'Lima value',
      'Lima, Peru',
      directionOption()
    )
    draft.scope.references[1].role = 'comparator'

    expect(validateCommissionDraft(draft, catalog)).toContainEqual({
      path: 'commission.scope',
      message: 'single_subject scope cannot contain comparators.'
    })
    await expect(approveCommission(draft, catalog)).rejects.toThrow(
      'commission.scope: single_subject scope cannot contain comparators.'
    )
  })

  it('creates a fingerprinted approved commission only after validation', async () => {
    const draft = createCommissionDraft(
      'Lima value',
      'Lima, Peru',
      directionOption()
    )

    const commission = await approveCommission(draft, catalog)

    expect(commission).toEqual({
      ...draft,
      commission_fingerprint: await fingerprintCommission(draft)
    })
    expect(commission.commission_fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('fingerprintCommission', () => {
  it('matches the canonical Lima regression fingerprint', async () => {
    const commission =
      limaFixture.commission as unknown as Prompt2BlogCommission
    const { commission_fingerprint: _stored, ...draft } = commission

    await expect(fingerprintCommission(draft)).resolves.toBe(
      'd1c2c9e041513d1d2b54261f8be5a1a3904a206b9daddf5e392c81b9e7cdcf48'
    )
  })

  it('ignores object insertion order but changes after any commission edit', async () => {
    const original = createCommissionDraft(
      'Lima value',
      'Lima, Peru',
      directionOption()
    )
    const reordered = JSON.parse(
      JSON.stringify(original)
    ) as Prompt2BlogCommissionDraft
    reordered.audience = {
      tags: [...(original.audience.tags ?? [])],
      primary_reader: original.audience.primary_reader
    }

    expect(await fingerprintCommission(reordered)).toBe(
      await fingerprintCommission(original)
    )

    reordered.approved_direction = `${reordered.approved_direction} Updated.`
    expect(await fingerprintCommission(reordered)).not.toBe(
      await fingerprintCommission(original)
    )
  })
})
