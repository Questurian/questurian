import { describe, expect, it } from 'vitest'
import type {
  Prompt2BlogCommission,
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogEvidencePackage
} from '../api'
import type { EvidenceReadinessFinding } from './evidence-import'
import { buildFollowUpResearchPrompt } from './follow-up-research-prompt'
import { REQUIREMENT_STATUS_RULES } from './research-prompt'

const fingerprint =
  'd1c2c9e041513d1d2b54261f8be5a1a3904a206b9daddf5e392c81b9e7cdcf48'

const commission: Prompt2BlogCommission = {
  schema_version: 3,
  commission_fingerprint: fingerprint,
  original_title: 'Lima after the bargain era',
  location: 'Lima, Peru',
  approved_direction:
    'Report Lima as one subject through current costs and lived context.',
  form_id: 'feature-profile',
  topic_module_ids: ['cost-affordability'],
  audience: { primary_reader: 'Prospective long-stay residents', tags: [] },
  core_reader_question: 'What does Lima offer long-stay residents now?',
  reader_outcome: 'Understand current value and tradeoffs.',
  primary_subject: 'Lima',
  scope: {
    mode: 'single_subject',
    references: [
      { name: 'Lima', role: 'primary_subject' },
      { name: 'Medellín', role: 'context_only' }
    ]
  },
  requirements: [
    { requirement_id: 'r1', question: 'What are current routine costs?' },
    {
      requirement_id: 'r2',
      question: 'Which people and scenes show lived context?'
    }
  ],
  exclusions: ['Do not make Medellín a co-subject.'],
  call_to_action: null
}

const catalog: Prompt2BlogEditorialOptionsResponse = {
  schema_version: 3,
  forms: [
    {
      id: 'feature-profile',
      label: 'Feature/Profile',
      description: 'Reported narrative using people, scenes, and quotations.',
      order: 4,
      source_requirements: ['reported-people-scenes-quotations'],
      use_when: 'Use when the fixture needs a form.',
      do_not_use_when: 'Do not use when another form fits better.'
    },
    {
      id: 'interview-qa',
      label: 'Interview/Q&A',
      description: 'Attributable interview responses.',
      order: 5,
      source_requirements: ['attributable-responses'],
      use_when: 'Use when the fixture needs a form.',
      do_not_use_when: 'Do not use when another form fits better.'
    }
  ],
  topic_modules: [
    {
      id: 'cost-affordability',
      label: 'Cost and affordability',
      description: 'Use current, comparable, dated price evidence.',
      order: 1
    },
    {
      id: 'food-drink',
      label: 'Food and drink',
      description: 'Inactive guidance must stay out.',
      order: 3
    }
  ],
  audience_tags: [],
  scope_modes: [],
  reference_roles: []
}

const incompleteEvidence: Prompt2BlogEvidencePackage = {
  schema_version: 3,
  commission_fingerprint: fingerprint,
  sources: [
    {
      source_id: 's1',
      title: 'Current price bulletin',
      publisher: 'Statistics office',
      url: 'https://example.com/prices',
      published_at: '2026-07-01',
      retrieved_at: '2026-08-25',
      source_type: 'official',
      material_type: 'report',
      notes: ['Provides a dated current cost baseline.']
    }
  ],
  claims: [
    {
      claim_id: 'c1',
      text: 'Current official figures establish a cost baseline.',
      source_ids: ['s1'],
      requirement_ids: ['r1'],
      as_of: '2026-07-01',
      confidence: 'high'
    },
    {
      claim_id: 'c2',
      text: 'A second estimate conflicts with the official baseline.',
      source_ids: ['s1'],
      requirement_ids: ['r1'],
      as_of: '2026-07-01',
      confidence: 'low'
    }
  ],
  requirements: [
    {
      requirement_id: 'r1',
      status: 'supported',
      claim_ids: ['c1', 'c2'],
      gap: ''
    },
    {
      requirement_id: 'r2',
      status: 'partial',
      claim_ids: [],
      gap: 'No attributable people or documented scenes yet.'
    }
  ],
  conflicts: [
    {
      conflict_id: 'x1',
      claim_ids: ['c1', 'c2'],
      summary: 'Two cost baselines disagree.',
      resolution: null
    }
  ],
  gaps: [
    {
      gap_id: 'g1',
      requirement_ids: ['r2'],
      summary: 'Find attributable people and documented scenes.'
    }
  ]
}

describe('buildFollowUpResearchPrompt', () => {
  it('returns null when requirements, conflicts, source gates, and findings are ready', () => {
    const interviewCommission: Prompt2BlogCommission = {
      ...commission,
      form_id: 'interview-qa',
      topic_module_ids: [],
      requirements: [
        { requirement_id: 'r1', question: 'What did the speaker say?' }
      ]
    }
    const readyEvidence: Prompt2BlogEvidencePackage = {
      schema_version: 3,
      commission_fingerprint: fingerprint,
      sources: [
        {
          source_id: 's1',
          title: 'Interview transcript',
          publisher: null,
          url: null,
          published_at: null,
          retrieved_at: '2026-08-25',
          source_type: 'firsthand',
          material_type: 'interview-responses',
          notes: ['Attributable answer from the named speaker.']
        }
      ],
      claims: [
        {
          claim_id: 'c1',
          text: 'The speaker supplied an attributable answer.',
          source_ids: ['s1'],
          requirement_ids: ['r1'],
          as_of: null,
          confidence: 'high'
        }
      ],
      requirements: [
        {
          requirement_id: 'r1',
          status: 'supported',
          claim_ids: ['c1'],
          gap: ''
        }
      ],
      conflicts: [],
      gaps: []
    }

    expect(
      buildFollowUpResearchPrompt(
        interviewCommission,
        readyEvidence,
        [],
        catalog
      )
    ).toBeNull()
  })

  it('requests a complete replacement package targeted only at unresolved work', () => {
    const findings: EvidenceReadinessFinding[] = [
      {
        code: 'source_gate',
        message:
          'Feature lacks attributable people, documented scenes, and quotations.',
        requirement_ids: ['r2']
      }
    ]

    const prompt = buildFollowUpResearchPrompt(
      commission,
      incompleteEvidence,
      findings,
      catalog
    )

    expect(prompt).not.toBeNull()
    expect(prompt).toContain(`"commission_fingerprint": "${fingerprint}"`)
    expect(prompt).toContain('Return a complete replacement evidence package')
    expect(prompt).toContain('Do not redo or weaken already supported work')
    expect(prompt).toContain(
      '- r2 — Which people and scenes show lived context?'
    )
    expect(prompt).not.toContain('- r1 — What are current routine costs?')
    expect(prompt).toContain('- x1 — Two cost baselines disagree.')
    expect(prompt).toContain('source_gate — Feature lacks attributable people')
    expect(prompt).toContain('cost-affordability (Cost and affordability)')
    expect(prompt).not.toContain('Inactive guidance must stay out.')
    expect(prompt).toContain('Do not add a comparator')
    expect(prompt).toContain(
      '"material_type": "web|report|transcript|interview-responses|first-person-notes|evaluation-notes|other"'
    )
  })

  it('never re-asks a question already established as unpublished', () => {
    // A reported gap and a readiness finding both named r2 here. Before this,
    // either one dragged a settled question back into the next round, and the
    // round returned the same sentence at full package cost.
    const evidencePackage: Prompt2BlogEvidencePackage = {
      ...incompleteEvidence,
      requirements: [
        incompleteEvidence.requirements[0],
        {
          requirement_id: 'r2',
          status: 'unpublished',
          claim_ids: [],
          gap: 'Checked the regulator and the operator. Neither measures it.'
        }
      ]
    }
    const findings: EvidenceReadinessFinding[] = [
      {
        code: 'source_gate',
        message: 'Feature lacks attributable people.',
        requirement_ids: ['r2']
      }
    ]

    const prompt = buildFollowUpResearchPrompt(
      commission,
      evidencePackage,
      findings,
      catalog
    )

    expect(prompt).not.toBeNull()
    const unresolved = prompt!
      .split('UNRESOLVED REQUIREMENTS ONLY')[1]
      .split('ALREADY ESTABLISHED AS UNPUBLISHED')[0]
    expect(unresolved).not.toContain('r2')
    expect(prompt).toContain(
      '- r2 — Which people and scenes show lived context? [what was checked: Checked the regulator and the operator. Neither measures it.]'
    )
    expect(prompt).toContain('Do not search them again')
  })

  it('carries the same status-versus-confidence rules as the initial prompt', () => {
    const prompt = buildFollowUpResearchPrompt(
      commission,
      incompleteEvidence,
      [],
      catalog
    )

    expect(prompt).toContain(REQUIREMENT_STATUS_RULES)
    expect(prompt).toContain(
      'Set requirement status and claim confidence by the rules below, including for work this follow-up still cannot close.'
    )
    expect(prompt).not.toContain('Use partial or missing honestly')
  })
})
